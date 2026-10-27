import type { JdRequirements, JdSkillRequirement, PositionGroup } from '@srm/shared';
import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { POSITION_GROUP_LABELS, SKILL_LEVEL_LABELS } from '../labels';

/** Weights are relative (CONTEXT D35); show a decimal only when there is one. */
function formatWeight(weight: number): string {
  return formatNumber(weight, Number.isInteger(weight) ? 0 : 1);
}

function SkillTable({ caption, skills }: { caption: string; skills: JdSkillRequirement[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{caption}</h3>
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kỹ năng</TableHead>
              <TableHead>Mức độ</TableHead>
              <TableHead className="text-right">Trọng số</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skills.map((skill) => (
              <TableRow key={skill.skill}>
                <TableCell className="whitespace-normal break-words">{skill.skill}</TableCell>
                <TableCell>{SKILL_LEVEL_LABELS[skill.level]}</TableCell>
                <TableCell className="text-right tabular-nums">{formatWeight(skill.weight)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

const none = <span className="text-muted-foreground">Không yêu cầu</span>;

/** Read-only view of a JD's normalised requirements (US-2.3 AC-7). */
export function RequirementsSummary({
  requirements,
  positionGroup,
}: {
  requirements: JdRequirements;
  positionGroup: PositionGroup | null;
}) {
  const { hard_conditions: conditions } = requirements;
  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col gap-3">
        <Row label="Nhóm vị trí">{positionGroup ? POSITION_GROUP_LABELS[positionGroup] : none}</Row>
        <Row label="Ngành">{conditions.majors.length > 0 ? conditions.majors.join(', ') : 'Mọi ngành'}</Row>
        <Row label="Năm học tối thiểu">
          {conditions.min_study_year === null ? none : <span className="tabular-nums">Năm {conditions.min_study_year}</span>}
        </Row>
        <Row label="GPA tối thiểu (thang 4)">
          {conditions.min_gpa === null ? none : <span className="tabular-nums">{formatNumber(conditions.min_gpa, 2)}</span>}
        </Row>
        <Row label="Ngoại ngữ bắt buộc">
          {conditions.required_languages.length > 0 ? conditions.required_languages.join(', ') : none}
        </Row>
      </dl>
      <SkillTable caption="Kỹ năng bắt buộc" skills={requirements.must_have} />
      <SkillTable caption="Kỹ năng bổ trợ" skills={requirements.nice_to_have} />
    </div>
  );
}
