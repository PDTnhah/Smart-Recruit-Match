import type { ExamResultSkill } from '@srm/shared';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from 'recharts';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { formatNumber } from '@/lib/format';

/** The primary token: 6.8:1 on white (DESIGN.md §11), so the shape reads against the grid. */
const CONFIG = { score: { label: 'Điểm', color: 'var(--primary)' } } satisfies ChartConfig;

/** A radar needs three axes to be a shape; fewer skills show as bars only. */
const MIN_RADAR_SKILLS = 3;

/**
 * The skill map of the test (`skill_scores`, US-5.3 AC-2, AC-12): a radar from three skills on, and
 * always the list of scores in words, so nothing rests on the picture (DESIGN.md §11). A skill whose
 * questions all weigh 0 has no score and stays out of the radar.
 */
export function SkillRadar({ skills }: { skills: readonly ExamResultSkill[] }) {
  const scored = skills.filter((skill): skill is ExamResultSkill & { score: number } => skill.score !== null);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {scored.length >= MIN_RADAR_SKILLS && (
        <ChartContainer config={CONFIG} className="mx-auto aspect-square w-full max-w-sm" aria-hidden="true">
          <RadarChart data={scored} outerRadius="70%">
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <PolarGrid />
            <PolarAngleAxis dataKey="skill" />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="score" fill="var(--color-score)" fillOpacity={0.3} stroke="var(--color-score)" />
          </RadarChart>
        </ChartContainer>
      )}
      <ul className="flex flex-col gap-3">
        {skills.map((skill) => (
          <li key={skill.skill} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="min-w-0 break-words">{skill.skill}</span>
              <span className="shrink-0 tabular-nums">
                {skill.score === null ? 'Không tính' : `${formatNumber(skill.score, 2)}/100`}
              </span>
            </div>
            {skill.score !== null && <Progress value={skill.score} aria-label={`Điểm ${skill.skill}`} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
