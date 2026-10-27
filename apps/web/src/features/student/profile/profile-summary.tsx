import type { CvProfile } from '@srm/shared';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

function period(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  return `${start ?? '…'} – ${end ?? '…'}`;
}

/** "Kỹ sư · Khoa học máy tính · 2022 – hiện tại": the parts present, in order. */
function line(...parts: Array<string | null>): string | null {
  const present = parts.filter((part): part is string => part !== null);
  return present.length > 0 ? present.join(' · ') : null;
}

function Section({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-base font-medium">{title}</h3>
      {empty ? <p className="text-sm text-muted-foreground">Không có</p> : children}
    </section>
  );
}

function Entry({ title, details, text }: { title: string; details?: string | null; text?: string | null }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium break-words">{title}</span>
      {details && <span className="break-words text-muted-foreground">{details}</span>}
      {text && <p className="break-words whitespace-pre-line">{text}</p>}
    </li>
  );
}

/** The profile as text, once confirmed or when it can no longer change (US-2.6 AC-12). */
export function ProfileSummary({ profile }: { profile: CvProfile }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {profile.summary && (
        <>
          <p className="text-sm break-words whitespace-pre-line">{profile.summary}</p>
          <Separator />
        </>
      )}
      <Section title="Học vấn" empty={profile.education.length === 0}>
        <ul className="flex flex-col gap-3">
          {profile.education.map((item, index) => (
            <Entry
              key={index}
              title={item.institution}
              details={line(item.degree, item.major, period(item.start, item.end), item.gpa && `GPA ${item.gpa}`)}
            />
          ))}
        </ul>
      </Section>
      <Separator />
      <Section title="Kỹ năng" empty={profile.skills.length === 0}>
        <ul className="flex flex-wrap gap-2">
          {profile.skills.map((skill, index) => (
            <li key={index} className="max-w-full">
              <Badge variant="secondary" className="max-w-full">
                <span className="truncate">{skill.name}</span>
              </Badge>
            </li>
          ))}
        </ul>
      </Section>
      <Separator />
      <Section title="Dự án" empty={profile.projects.length === 0}>
        <ul className="flex flex-col gap-3">
          {profile.projects.map((project, index) => (
            <Entry
              key={index}
              title={project.name}
              details={line(project.role, period(project.start, project.end), project.technologies.join(', ') || null)}
              text={project.description}
            />
          ))}
        </ul>
      </Section>
      <Separator />
      <Section title="Kinh nghiệm làm việc" empty={profile.experience.length === 0}>
        <ul className="flex flex-col gap-3">
          {profile.experience.map((job, index) => (
            <Entry
              key={index}
              title={job.organization}
              details={line(job.position, period(job.start, job.end))}
              text={job.description}
            />
          ))}
        </ul>
      </Section>
      <Separator />
      <Section title="Ngoại ngữ" empty={profile.languages.length === 0}>
        <ul className="flex flex-col gap-3">
          {profile.languages.map((language, index) => (
            <Entry key={index} title={language.language} details={language.level} />
          ))}
        </ul>
      </Section>
      <Separator />
      <Section title="Chứng chỉ, giải thưởng" empty={profile.certificates.length === 0}>
        <ul className="flex flex-col gap-3">
          {profile.certificates.map((certificate, index) => (
            <Entry key={index} title={certificate.name} details={line(certificate.issuer, certificate.year)} />
          ))}
        </ul>
      </Section>
    </div>
  );
}
