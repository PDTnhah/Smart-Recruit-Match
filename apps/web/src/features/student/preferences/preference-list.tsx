import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  APPLICATION_STATUS_LABELS,
  type JdCompetition,
  type PreferenceItem,
  type ShortlistCampaign,
  type ShortlistJd,
} from '@srm/shared';
import { ArrowDown, ArrowUp, CircleAlert, GripVertical, Info, ListOrdered, TriangleAlert, X } from 'lucide-react';
import { useId } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { CompetitionSummary } from './competition-badge';
import { type Draft, moveInDraft, removeFromDraft } from './draft';

/** Rows only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** dnd-kit's built-in announcements are English (DESIGN.md §9). */
const DRAG_INSTRUCTIONS =
  'Nhấn Space hoặc Enter để nhấc nguyện vọng, dùng phím mũi tên lên, xuống để di chuyển, Space hoặc Enter để thả, Esc để hủy.';

interface PreferenceRowProps {
  jdId: number;
  rank: number;
  count: number;
  jd: ShortlistJd | undefined;
  competition: JdCompetition | undefined;
  /** No longer among the suggestions: it cannot be saved again. */
  stale: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
}

/** The JD of a preference, with its competition level while it is on the shortlist (US-3.4 AC-8). */
function JdName({
  jd,
  rank,
  competition,
}: {
  jd: ShortlistJd | undefined;
  rank: number;
  competition: JdCompetition | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <Badge className="mt-0.5">NV{rank}</Badge>
      <div className="flex min-w-0 flex-col">
        <span className="font-medium break-words">{jd?.title ?? 'JD không còn trong đợt'}</span>
        {jd && (
          <span className="truncate text-muted-foreground" title={jd.companyName}>
            {jd.companyName}
          </span>
        )}
        {competition && <CompetitionSummary competition={competition} className="mt-1" />}
      </div>
    </div>
  );
}

/** One preference that can be dragged by its handle, or moved with the buttons (AC-14). */
function SortablePreference({ jdId, rank, count, jd, competition, stale, onMove, onRemove }: PreferenceRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: jdId,
    attributes: { roleDescription: 'nguyện vọng kéo được' },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'relative z-10' : undefined}
    >
      <Card size="sm">
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <JdName jd={jd} rank={rank} competition={competition} />
            {stale && (
              <p className="flex gap-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                JD này không còn trong danh sách gợi ý. Bỏ JD này rồi lưu lại.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-1 sm:justify-end">
            <Button
              ref={setActivatorNodeRef}
              variant="ghost"
              size="icon"
              className="cursor-grab touch-none"
              aria-label={`Kéo để đổi thứ tự NV${rank}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical />
            </Button>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Đưa NV${rank} lên`}
                disabled={rank === 1}
                onClick={() => onMove(rank - 2)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Đưa NV${rank} xuống`}
                disabled={rank === count}
                onClick={() => onMove(rank)}
              >
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Bỏ NV${rank}`} onClick={onRemove}>
                <X />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function SortablePreferences({
  draft,
  jds,
  competitions,
  shortlistIds,
  onChange,
}: {
  draft: Draft;
  jds: ReadonlyMap<number, ShortlistJd>;
  competitions: ReadonlyMap<number, JdCompetition>;
  shortlistIds: ReadonlySet<number>;
  onChange: (draft: Draft) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A short hold, so a finger that lands on the handle while scrolling does not start a drag.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const nameOf = (id: UniqueIdentifier) => jds.get(Number(id))?.title ?? 'JD';
  const placeOf = (id: UniqueIdentifier) => `NV${draft.indexOf(Number(id)) + 1}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Đã nhấc ${nameOf(active.id)} ở vị trí ${placeOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} sẽ ở vị trí ${placeOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) =>
      over ? `Đã thả ${nameOf(active.id)} ở vị trí ${placeOf(over.id)}.` : `Đã thả ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) => `Đã hủy kéo. ${nameOf(active.id)} giữ vị trí ${placeOf(active.id)}.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onChange(moveInDraft(draft, draft.indexOf(Number(active.id)), draft.indexOf(Number(over.id))));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: DRAG_INSTRUCTIONS } }}
    >
      <SortableContext items={[...draft]} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2">
          {draft.map((jdId, index) => (
            <SortablePreference
              key={jdId}
              jdId={jdId}
              rank={index + 1}
              count={draft.length}
              jd={jds.get(jdId)}
              competition={competitions.get(jdId)}
              stale={!shortlistIds.has(jdId)}
              onMove={(to) => onChange(moveInDraft(draft, index, to))}
              onRemove={() => onChange(removeFromDraft(draft, jdId))}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

/** The saved list once it is locked, with where each preference stands. */
function ReadOnlyPreferences({
  preferences,
  jds,
  competitions,
}: {
  preferences: readonly PreferenceItem[];
  jds: ReadonlyMap<number, ShortlistJd>;
  competitions: ReadonlyMap<number, JdCompetition>;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {preferences.map((preference) => (
        <li key={preference.jdId}>
          <Card size="sm">
            <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <JdName jd={jds.get(preference.jdId)} rank={preference.rank} competition={competitions.get(preference.jdId)} />
              <Badge variant="secondary" className="self-start sm:self-center">
                {APPLICATION_STATUS_LABELS[preference.status]}
              </Badge>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}

interface PreferenceListProps {
  campaign: ShortlistCampaign;
  draft: Draft;
  /** The saved list, by rank. */
  saved: readonly PreferenceItem[];
  /** Cards of every JD the screen knows, by id. */
  jds: ReadonlyMap<number, ShortlistJd>;
  /** Competition level of the JDs on the shortlist, by id (US-3.4). */
  competitions: ReadonlyMap<number, JdCompetition>;
  shortlistIds: ReadonlySet<number>;
  /** min(N_NV, number of suggestions): what "chọn đủ" means (AC-8). */
  required: number;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onDiscard: () => void;
  /** Opens the suggestions tab on phones. */
  onBrowse: () => void;
}

/**
 * "Nguyện vọng x/N" (US-3.3 AC-8, AC-9, AC-14, AC-15): the list being edited, NV1 first, saved
 * whole with "Lưu nguyện vọng"; read-only once the campaign has locked it.
 */
export function PreferenceList({
  campaign,
  draft,
  saved,
  jds,
  competitions,
  shortlistIds,
  required,
  dirty,
  saving,
  error,
  onChange,
  onSave,
  onDiscard,
  onBrowse,
}: PreferenceListProps) {
  const titleId = useId();
  const { editable, nNv } = campaign;
  const short = draft.length < required;
  const hasStale = draft.some((jdId) => !shortlistIds.has(jdId));
  const blocked = (campaign.requireFullPreferences && short) || hasStale;
  const errorAlert = error !== null && (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Chưa lưu được nguyện vọng</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="text-base font-medium">
          Nguyện vọng {editable ? draft.length : saved.length}/{nNv}
        </h2>
        {editable && dirty && <Badge variant="outline">Chưa lưu</Badge>}
      </div>
      {/* PRD GĐ4 step 4 (AC-15): always shown. */}
      <Alert>
        <Info />
        <AlertTitle>Xếp nguyện vọng đúng mong muốn thật</AlertTitle>
        <AlertDescription>
          Thuật toán phân bổ bảo đảm: đặt công ty cạnh tranh ở NV1 không làm sinh viên mất cơ hội ở NV2, NV3. Vì vậy hãy xếp
          nguyện vọng theo đúng thứ tự mong muốn.
        </AlertDescription>
      </Alert>

      {/* A save refused because the list has just been locked shows here too. */}
      {!editable && errorAlert}
      {!editable ? (
        saved.length > 0 ? (
          <ReadOnlyPreferences preferences={saved} jds={jds} competitions={competitions} />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListOrdered />
              </EmptyMedia>
              <EmptyTitle>Không có nguyện vọng nào</EmptyTitle>
              <EmptyDescription>Đợt đã khóa danh sách nguyện vọng và không có nguyện vọng nào được lưu.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <>
          {draft.length > 0 ? (
            <SortablePreferences
              draft={draft}
              jds={jds}
              competitions={competitions}
              shortlistIds={shortlistIds}
              onChange={onChange}
            />
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListOrdered />
                </EmptyMedia>
                <EmptyTitle>Chưa chọn nguyện vọng nào</EmptyTitle>
                <EmptyDescription>
                  Chọn tối đa {nNv} JD trong danh sách gợi ý, rồi sắp theo thứ tự mong muốn.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="lg:hidden">
                <Button variant="outline" onClick={onBrowse}>
                  Xem gợi ý
                </Button>
              </EmptyContent>
            </Empty>
          )}
          {short && required > 0 && (
            <p className="text-sm text-muted-foreground">
              {campaign.requireFullPreferences
                ? `Đợt này yêu cầu chọn đủ ${required} nguyện vọng mới lưu được.`
                : `Nên chọn đủ ${required} nguyện vọng để có thêm cơ hội được phân bổ.`}
            </p>
          )}
          {errorAlert}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {dirty && (
              <Button variant="outline" onClick={onDiscard} disabled={saving}>
                Bỏ thay đổi
              </Button>
            )}
            <Button onClick={onSave} disabled={!dirty || saving || blocked}>
              {saving && <Spinner data-icon="inline-start" />}
              Lưu nguyện vọng
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
