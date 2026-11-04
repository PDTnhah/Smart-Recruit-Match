import type { MatchSkillVerdict, ShortlistItem } from '@srm/shared';
import { FileSearch, TriangleAlert } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { SCV_CRITERION_LABELS } from '@/features/center/campaigns/labels';
import { SKILL_ZONE_LABELS } from '@/features/center/skills/labels';
import { SKILL_LEVEL_LABELS } from '@/features/jds/labels';
import { formatNumber } from '@/lib/format';
import {
  EVIDENCE_SECTION_LABELS,
  EVIDENCE_TIER_LABELS,
  formatBasisPoints,
  formatX100,
  MAJOR_MATCH_LABELS,
  matchKindLabel,
  VERDICT_LABELS,
} from './labels';
import { VerdictBadge } from './verdict-badge';

/** Most CV entries shown under one skill; the verdict lists up to ten. */
const SOURCES_SHOWN = 3;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h3 id={id} className="text-base font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

function TextList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
      {items.map((text, index) => (
        <li key={index} className="break-words">
          {text}
        </li>
      ))}
    </ul>
  );
}

/** S_cv and the five criteria: score sᵢ, weight wᵢ after redistribution, contribution (NFR-4). */
function ScoreSection({ item }: { item: ShortlistItem }) {
  return (
    <Section title="Điểm phù hợp">
      <p className="text-sm">
        <span className="text-2xl font-semibold tabular-nums">{formatX100(Math.round(item.sCv * 100))}</span>
        <span className="text-muted-foreground">/100</span>
      </p>
      <ul className="flex flex-col gap-3">
        {item.breakdown.map((row) => (
          <li key={row.criterion} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="min-w-0 font-medium">{SCV_CRITERION_LABELS[row.criterion]}</span>
              <span className="shrink-0 tabular-nums">
                {row.applicable ? `+${formatX100(row.contributionX100)}` : 'Không áp dụng'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {row.applicable && row.scoreX100 !== null
                ? `Điểm ${formatX100(row.scoreX100)}/100 × trọng số ${formatBasisPoints(row.effectiveWeightBp)}` +
                  (row.effectiveWeightBp !== row.weightBp ? ` (cấu hình ${formatBasisPoints(row.weightBp)})` : '')
                : 'JD không yêu cầu tiêu chí này; trọng số của nó được chia cho các tiêu chí còn lại.'}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** One JD skill: verdict, required level, evidence tier, match kind and the CV entries (AC-16). */
function SkillRow({ skill }: { skill: MatchSkillVerdict }) {
  const kind = matchKindLabel(skill.match_kind, skill.via);
  const facts = [
    `Yêu cầu: ${SKILL_LEVEL_LABELS[skill.level_required]}`,
    `Mức bằng chứng: ${EVIDENCE_TIER_LABELS[skill.tier] ?? EVIDENCE_TIER_LABELS[0]}`,
    ...(kind ? [kind] : []),
  ];
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-sm font-medium break-words">{skill.skill}</span>
        <VerdictBadge verdict={skill.verdict} />
      </div>
      <p className="text-sm text-muted-foreground">{facts.join(' · ')}</p>
      {skill.sources.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {skill.sources.slice(0, SOURCES_SHOWN).map((source) => (
            <li key={`${source.section}-${source.index}`} className="break-words">
              <span className="text-muted-foreground">{EVIDENCE_SECTION_LABELS[source.section]}:</span> {source.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SkillSection({ title, skills }: { title: string; skills: readonly MatchSkillVerdict[] }) {
  if (skills.length === 0) return null;
  return (
    <Section title={title}>
      <ul className="flex flex-col gap-4">
        {skills.map((skill) => (
          <SkillRow key={skill.skill} skill={skill} />
        ))}
      </ul>
    </Section>
  );
}

/** Coverage by field of work as bars with their percentage (AC-17), largest demand first. */
function ZoneSection({ item }: { item: ShortlistItem }) {
  if (item.zones.length === 0) return null;
  const zones = [...item.zones].sort((a, b) => b.demandWeightX100 - a.demandWeightX100);
  return (
    <Section title="Độ phủ theo lĩnh vực">
      <p className="text-sm text-muted-foreground">Phần kỹ năng của từng lĩnh vực trong JD mà hồ sơ đáp ứng.</p>
      <ul className="flex flex-col gap-3">
        {zones.map((zone) => {
          const label = SKILL_ZONE_LABELS[zone.zone];
          const percent = zone.coverageX100 / 100;
          return (
            <li key={zone.zone} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0">{label}</span>
                <span className="shrink-0 tabular-nums">{formatNumber(Math.round(percent))} %</span>
              </div>
              <Progress value={percent} aria-label={`Độ phủ ${label}`} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Project score of the Matching Agent; a quote the CV does not contain is flagged (AC-17, CONTEXT D46). */
function ProjectSection({ item }: { item: ShortlistItem }) {
  const { project } = item;
  const unmatched = project.quotes.some((quote) => !quote.matched);
  return (
    <Section title={SCV_CRITERION_LABELS.project}>
      <p className="text-sm">
        Điểm <span className="font-medium tabular-nums">{project.score}/4</span>
      </p>
      <p className="text-sm break-words">{project.reason}</p>
      {unmatched && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>Có trích dẫn không khớp với CV</AlertTitle>
          <AlertDescription>
            Hệ thống không tìm thấy nguyên văn một số câu AI trích dẫn trong CV (đánh dấu bên dưới), nên điểm dự án có thể
            chưa chính xác.
          </AlertDescription>
        </Alert>
      )}
      {project.quotes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {project.quotes.map((quote, index) => (
            <li key={index} className="flex flex-col gap-1 border-l-2 pl-3 text-sm">
              <q className="break-words">{quote.quote}</q>
              {!quote.matched && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  Không tìm thấy câu này trong CV
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Required and preferred languages against the student's, with CEFR levels (AC-16). */
function LanguageSection({ item }: { item: ShortlistItem }) {
  const { language } = item;
  return (
    <Section title={SCV_CRITERION_LABELS.language}>
      {language ? (
        <>
          <VerdictBadge verdict={language.verdict} />
          <p className="text-sm break-words">
            <span className="text-muted-foreground">JD yêu cầu:</span> {language.required}
          </p>
          <p className="text-sm break-words">
            <span className="text-muted-foreground">Hồ sơ có:</span>{' '}
            {language.held ?? 'chưa có ngoại ngữ hay chứng chỉ nào'}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">JD không yêu cầu ngoại ngữ.</p>
      )}
    </Section>
  );
}

function EducationSection({ item }: { item: ShortlistItem }) {
  const { education } = item;
  return (
    <Section title={SCV_CRITERION_LABELS.education}>
      <p className="text-sm">{MAJOR_MATCH_LABELS[education.major_match]}</p>
      {education.major_unrecognized && (
        <p className="text-sm text-muted-foreground">
          Ngành trong hồ sơ chưa thuộc nhóm ngành nào của danh mục nên được tính là ngành khác.
        </p>
      )}
      <p className="text-sm text-muted-foreground">GPA lấy từ hồ sơ học vụ của trường, không lấy từ CV.</p>
    </Section>
  );
}

/**
 * Why the JD is suggested (US-3.3 AC-1, AC-16, AC-17, NFR-4): everything comes from the stored
 * result, nothing asks the AI again. A bottom sheet on phones, a side sheet from `md` (DESIGN.md §5
 * item 7). `footer` holds the choose action of the card.
 */
export function JdExplanationSheet({ item, footer }: { item: ShortlistItem; footer?: ReactNode }) {
  const isMobile = useIsMobile();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <FileSearch data-icon="inline-start" />
          Xem giải thích
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'max-h-[85svh]' : 'data-[side=right]:md:max-w-lg'}
      >
        {/* Room for the close button in the corner. */}
        <SheetHeader className="pr-12">
          <SheetTitle className="break-words">{item.jd.title}</SheetTitle>
          <SheetDescription className="break-words">{item.jd.companyName}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4">
          <ScoreSection item={item} />
          {item.summary && (
            <Section title="Nhận xét">
              <p className="text-sm break-words">{item.summary}</p>
            </Section>
          )}
          {item.strengths.length > 0 && (
            <Section title="Điểm mạnh">
              <TextList items={item.strengths} />
            </Section>
          )}
          {item.gaps.length > 0 && (
            <Section title="Kỹ năng còn thiếu">
              <TextList
                items={item.gaps.map(
                  (gap) =>
                    `${gap.skill}: yêu cầu ${SKILL_LEVEL_LABELS[gap.levelRequired]}, hồ sơ ${VERDICT_LABELS[gap.verdict].toLowerCase()}`,
                )}
              />
            </Section>
          )}
          {item.suggestions.length > 0 && (
            <Section title="Gợi ý cải thiện">
              <TextList items={item.suggestions} />
            </Section>
          )}
          <SkillSection title={SCV_CRITERION_LABELS.must_have} skills={item.skills.must_have} />
          <SkillSection title={SCV_CRITERION_LABELS.nice_to_have} skills={item.skills.nice_to_have} />
          <ZoneSection item={item} />
          <ProjectSection item={item} />
          <LanguageSection item={item} />
          <EducationSection item={item} />
        </div>
        <SheetFooter>
          {footer}
          <SheetClose asChild>
            <Button variant="outline">Đóng</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
