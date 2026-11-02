import { type AdminSkill, SKILL_STATES, SKILL_ZONES, type SkillStatus, type SkillZone } from '@srm/shared';
import { CircleAlert, ListChecks } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDateTime } from '@/lib/format';
import { apiErrorMessage } from '@/shared/api/errors';
import { useAdminSkills } from './api';
import { ApproveSkillDialog } from './approve-skill-dialog';
import { EditTaxonomySheet } from './edit-taxonomy-sheet';
import { SKILL_FAMILY_LABELS, SKILL_GROUP_LABELS, SKILL_STATUS_LABELS, SKILL_ZONE_LABELS } from './labels';
import { MergeSkillDialog } from './merge-skill-dialog';
import { RejectSkillDialog } from './reject-skill-dialog';

const EMPTY_MESSAGES: Record<SkillStatus, { title: string; description: string }> = {
  PENDING: {
    title: 'Không có kỹ năng chờ duyệt',
    description: 'Kỹ năng mới hiện ở đây khi AI gặp trong CV hoặc JD một tên chưa có trong danh mục.',
  },
  APPROVED: { title: 'Danh mục chưa có kỹ năng nào', description: 'Kỹ năng được duyệt sẽ hiện ở đây.' },
  MERGED: { title: 'Chưa gộp kỹ năng nào', description: 'Kỹ năng đã gộp vào kỹ năng có sẵn sẽ hiện ở đây.' },
  REJECTED: { title: 'Chưa từ chối kỹ năng nào', description: 'Kỹ năng bị từ chối sẽ hiện ở đây.' },
};

/** The zone filter's value for every zone: Radix Select takes no empty value. */
const ALL_ZONES = 'ALL';

function isSkillStatus(value: string | null): value is SkillStatus {
  return SKILL_STATES.some((status) => status === value);
}

function isSkillZone(value: string | null): value is SkillZone {
  return SKILL_ZONES.some((zone) => zone === value);
}

function NoValue({ children }: { children: string }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/** What the skill normalizer suggested: advice only (AD-2). */
function Suggestion({ skill }: { skill: AdminSkill }) {
  const { suggestion } = skill;
  if (!suggestion) return <span className="text-muted-foreground">Chưa có gợi ý</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{suggestion.canonicalName}</span>
        <Badge variant="secondary">{SKILL_GROUP_LABELS[suggestion.group]}</Badge>
      </div>
      {suggestion.similarSkills.length > 0 && (
        <span className="text-muted-foreground">Có thể trùng: {suggestion.similarSkills.join(', ')}</span>
      )}
    </div>
  );
}

/** The column after the name: the suggestion while pending, the outcome afterwards. */
function Detail({ skill }: { skill: AdminSkill }) {
  switch (skill.status) {
    case 'PENDING':
      return <Suggestion skill={skill} />;
    case 'APPROVED':
      return (
        <div className="flex flex-col items-start gap-1">
          {skill.group && <Badge variant="secondary">{SKILL_GROUP_LABELS[skill.group]}</Badge>}
          {skill.aliases.length > 0 && <span className="text-muted-foreground">{skill.aliases.join(', ')}</span>}
        </div>
      );
    case 'MERGED':
      return <span>{skill.mergedInto?.canonicalName}</span>;
    case 'REJECTED':
      return null;
  }
}

/** A rejected skill has nothing more to show. */
const DETAIL_HEADERS: Record<SkillStatus, string | null> = {
  PENDING: 'Gợi ý của AI',
  APPROVED: 'Nhóm, tên gọi khác',
  MERGED: 'Đã gộp vào',
  REJECTED: null,
};

/** Approved skills also show their zone, family and implied skills (US-2.7 AC-10). */
function SkillTable({ status, skills }: { status: SkillStatus; skills: AdminSkill[] }) {
  const isMobile = useIsMobile();
  const pending = status === 'PENDING';
  const approved = status === 'APPROVED';
  const detailHeader = DETAIL_HEADERS[status];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{pending ? 'Tên AI phát hiện' : 'Tên kỹ năng'}</TableHead>
          {detailHeader !== null && <TableHead>{detailHeader}</TableHead>}
          {approved && (
            <>
              <TableHead>Vùng</TableHead>
              <TableHead>Họ</TableHead>
              <TableHead>Kéo theo</TableHead>
            </>
          )}
          <TableHead>{pending ? 'Phát hiện lúc' : 'Cập nhật lúc'}</TableHead>
          {(pending || approved) && (
            <TableHead>
              <span className="sr-only">Thao tác</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {skills.map((skill) => (
          <TableRow key={skill.id}>
            <TableCell className="max-w-64 truncate font-medium" title={skill.canonicalName}>
              {skill.canonicalName}
            </TableCell>
            {detailHeader !== null && (
              <TableCell className="max-w-96 whitespace-normal">
                <Detail skill={skill} />
              </TableCell>
            )}
            {approved && (
              <>
                <TableCell>{skill.zone ? SKILL_ZONE_LABELS[skill.zone] : <NoValue>Chưa có</NoValue>}</TableCell>
                <TableCell className="max-w-56 whitespace-normal">
                  {skill.family ? SKILL_FAMILY_LABELS[skill.family] : <NoValue>Chưa có</NoValue>}
                </TableCell>
                <TableCell className="max-w-64 whitespace-normal">
                  {skill.implies.length > 0 ? (
                    skill.implies.map((implied) => implied.canonicalName).join(', ')
                  ) : (
                    <NoValue>Không có</NoValue>
                  )}
                </TableCell>
              </>
            )}
            <TableCell>{formatDateTime(pending ? skill.createdAt : skill.updatedAt)}</TableCell>
            {pending && (
              <TableCell>
                <div className="flex justify-end gap-2">
                  <ApproveSkillDialog skill={skill} />
                  <MergeSkillDialog skill={skill} />
                  <RejectSkillDialog skill={skill} />
                </div>
              </TableCell>
            )}
            {approved && (
              <TableCell>
                <div className="flex justify-end">
                  <EditTaxonomySheet skill={skill} isMobile={isMobile} />
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * "Danh mục kỹ năng" of the admin portal (FR-13, US-2.5 AC-7, CONTEXT D39): the new skills the
 * AI found in CVs and JDs, oldest first, with the AI's suggestion. ADMIN approves, merges or
 * rejects each one; the other statuses show what was decided. Approved skills are filtered by
 * zone (`?zone=`) and their family and implied skills are edited here (FR-39, US-2.7).
 */
export function SkillReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('status');
  const status: SkillStatus = isSkillStatus(param) ? param : 'PENDING';
  const zoneParam = searchParams.get('zone');
  // Only approved skills have a family, hence a zone.
  const zone = status === 'APPROVED' && isSkillZone(zoneParam) ? zoneParam : undefined;
  const skills = useAdminSkills(status, zone);

  let content;
  if (skills.isPending) {
    content = (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (skills.isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Không tải được danh mục kỹ năng</AlertTitle>
        <AlertDescription>{apiErrorMessage(skills.error)}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void skills.refetch()}>
            Thử lại
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (skills.data.length === 0) {
    const empty =
      zone === undefined
        ? EMPTY_MESSAGES[status]
        : {
            title: `Vùng “${SKILL_ZONE_LABELS[zone]}” chưa có kỹ năng nào`,
            description: 'Kỹ năng thuộc một vùng khi được gán họ của vùng đó. Chọn vùng khác hoặc gán họ cho kỹ năng.',
          };
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>{empty.title}</EmptyTitle>
          <EmptyDescription>{empty.description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = <SkillTable status={status} skills={skills.data} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold md:text-2xl">Danh mục kỹ năng</h1>
          <p className="text-sm text-muted-foreground">
            Gợi ý của AI chỉ để tham khảo. Kỹ năng chỉ vào danh mục khi được duyệt.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {status === 'APPROVED' && (
            <Select
              value={zone ?? ALL_ZONES}
              onValueChange={(value) =>
                setSearchParams(value === ALL_ZONES ? { status } : { status, zone: value }, { replace: true })
              }
            >
              <SelectTrigger aria-label="Vùng kỹ năng" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL_ZONES}>Mọi vùng</SelectItem>
                  {SKILL_ZONES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SKILL_ZONE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
          <Select
            value={status}
            // Another status drops the zone filter.
            onValueChange={(value) => setSearchParams(value === 'PENDING' ? {} : { status: value }, { replace: true })}
          >
            <SelectTrigger aria-label="Trạng thái kỹ năng" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SKILL_STATES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {SKILL_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      {content}
    </>
  );
}
