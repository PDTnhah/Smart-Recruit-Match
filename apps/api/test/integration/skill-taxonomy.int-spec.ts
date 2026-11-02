// US-2.7 (FR-39, CONTEXT D42, D43): zones, families and implications of the skill catalogue. The
// seed places every catalogue skill; ADMIN sets the family and the implied skills on approval and
// edits them later; implications only join approved skills and never close a cycle; matching reads
// the closure through SkillCatalogService.taxonomy(). Test files share one database, so every name
// is unique and no test edits the implications of a seeded skill.
import { randomUUID } from 'node:crypto';
import {
  AdminSkillListSchema,
  AdminSkillSchema,
  ApiErrorSchema,
  FAMILY_ZONE,
  MAX_IMPLIED_SKILLS,
  type SkillGroup,
  skillMatchKey,
  SOFT_SKILL_FAMILIES,
} from '@srm/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { skillImplications, skills } from '../../src/db/schema/index.js';
import { findCycle } from '../../src/modules/skills/domain/implications.js';
import { SkillCatalogService } from '../../src/modules/skills/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { createSkill } from '../helpers/factories.js';
import { auditEntries } from '../helpers/state.js';

const NO_SUCH_ID = 2_000_000_000;
const SEEDED_SKILLS = 179;
const SEEDED_IMPLICATIONS = 81;
const NEW_SOFT_SKILLS = [
  ['Proactiveness', 'Chủ động', 'PROACTIVENESS'],
  ['Responsibility', 'Tinh thần trách nhiệm', 'RESPONSIBILITY'],
  ['Adaptability', 'Thích nghi', 'ADAPTABILITY'],
  ['Stress Tolerance', 'Chịu áp lực', 'ADAPTABILITY'],
  ['Attention to Detail', 'Cẩn thận tỉ mỉ', 'ATTENTION_TO_DETAIL'],
] as const;

describe('US-2.7: skill zones, families and implications', () => {
  let t: AuthTestApp;
  let admin: LoggedIn;

  beforeAll(async () => {
    t = await createAuthTestApp();
    admin = await t.loginAs('ADMIN');
  });

  afterAll(async () => {
    await t.close();
  });

  /** A name no other test uses (LESSONS §22). */
  const uniqueName = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

  const approvedSkill = (label: string, group: SkillGroup = 'FRAMEWORK') =>
    createSkill(t.db, { canonicalName: uniqueName(label), group });

  const pendingSkill = (label: string) =>
    createSkill(t.db, { canonicalName: uniqueName(label), group: null, status: 'PENDING' });

  const seedSkill = async (name: string) =>
    (await t.db.select().from(skills).where(and(eq(skills.nameKey, skillMatchKey(name)), eq(skills.status, 'APPROVED'))))[0]!;

  const rowById = async (id: number) => (await t.db.select().from(skills).where(eq(skills.id, id)))[0]!;

  const impliedIdsOf = async (id: number) =>
    (await t.db.select().from(skillImplications).where(eq(skillImplications.skillId, id)))
      .map((edge) => edge.impliedSkillId)
      .sort((a, b) => a - b);

  const patch = (id: number, body: object) => admin.agent.patch(api(`admin/skills/${id}/taxonomy`)).send(body);

  const approve = (id: number, body: object) => admin.agent.post(api(`admin/skills/${id}/approve`)).send(body);

  const listed = async (query: object) =>
    AdminSkillListSchema.parse((await admin.agent.get(api('admin/skills')).query(query).expect(200)).body).items;

  const ref = (skill: { id: number; canonicalName: string }) => ({ id: skill.id, canonicalName: skill.canonicalName });

  const ascending = (...ids: number[]) => [...ids].sort((a, b) => a - b);

  describe('AC-2, AC-3 migration and seed', () => {
    it('FR-39 seed: families assigned, no cycle, soft skills mapped', async () => {
      // Migrations 0015 and 0021 seed the catalogue; their rows share the earliest created_at
      // unless the five new soft skills came in a later migration run.
      const { rows } = await t.db.$client.query<{
        id: string;
        canonical_name: string;
        name_key: string;
        aliases: string[];
        alias_keys: string[];
        group: SkillGroup;
        family: string | null;
      }>(
        `SELECT id, canonical_name, name_key, aliases, alias_keys, "group", family FROM core.skills
         WHERE status = 'APPROVED'
           AND (created_at = (SELECT min(created_at) FROM core.skills) OR name_key = ANY($1))`,
        [NEW_SOFT_SKILLS.map(([name]) => skillMatchKey(name))],
      );
      expect(rows).toHaveLength(SEEDED_SKILLS);
      const owners = new Map<string, string>();
      for (const row of rows) {
        const softFamily = row.family !== null && (SOFT_SKILL_FAMILIES as readonly string[]).includes(row.family);
        expect([row.canonical_name, row.family !== null, softFamily]).toEqual([
          row.canonical_name,
          true,
          row.group === 'SOFT_SKILL',
        ]);
        expect([row.canonical_name, row.name_key, row.alias_keys]).toEqual([
          row.canonical_name,
          skillMatchKey(row.canonical_name),
          row.aliases.map(skillMatchKey),
        ]);
        for (const name of [row.canonical_name, ...row.aliases]) {
          expect([name, owners.get(skillMatchKey(name)) ?? row.id]).toEqual([name, row.id]);
          owners.set(skillMatchKey(name), row.id);
        }
      }
      // Every standard soft-skill competency has a skill.
      expect(new Set(rows.filter((row) => row.group === 'SOFT_SKILL').map((row) => row.family))).toEqual(
        new Set(SOFT_SKILL_FAMILIES),
      );
      for (const [name, alias, family] of NEW_SOFT_SKILLS) {
        expect(await seedSkill(name)).toMatchObject({ canonicalName: name, aliases: [alias], group: 'SOFT_SKILL', family });
      }
      expect((await seedSkill('Self-learning')).aliases).toContain('Ham học hỏi');

      const seedIds = new Set(rows.map((row) => Number(row.id)));
      const edges = await t.db.select().from(skillImplications);
      const seeded = edges.filter((edge) => seedIds.has(edge.skillId));
      expect(seeded).toHaveLength(SEEDED_IMPLICATIONS);
      expect(seeded.every((edge) => seedIds.has(edge.impliedSkillId))).toBe(true);
      expect(findCycle(edges)).toBeNull();
      const outgoing = new Map<number, number>();
      for (const edge of edges) outgoing.set(edge.skillId, (outgoing.get(edge.skillId) ?? 0) + 1);
      expect(Math.max(...outgoing.values())).toBeLessThanOrEqual(MAX_IMPLIED_SKILLS);

      const [next, react, springBoot, springFramework] = await Promise.all(
        ['Next.js', 'React', 'Spring Boot', 'Spring Framework'].map(seedSkill),
      );
      expect(await impliedIdsOf(next!.id)).toEqual([react!.id]);
      expect(await impliedIdsOf(springBoot!.id)).toEqual([springFramework!.id]);
      expect(await seedSkill('PostgreSQL')).toMatchObject({ family: 'RELATIONAL_DB' });
    });

    it('FR-39 Invariant 11: DB rejects a self implication, an unknown family and a soft family off soft skills', async () => {
      const framework = await approvedSkill('Checked');
      const soft = await approvedSkill('Checked soft', 'SOFT_SKILL');
      const pending = await pendingSkill('Checked pending');
      const link = (from: number, to: number) =>
        t.db.$client.query('INSERT INTO core.skill_implications (skill_id, implied_skill_id) VALUES ($1, $2)', [from, to]);
      const placeIn = (id: number, family: string) =>
        t.db.$client.query('UPDATE core.skills SET family = $2 WHERE id = $1', [id, family]);

      await expect(link(framework.id, framework.id)).rejects.toMatchObject({
        code: '23514',
        constraint: 'skill_implications_not_self_check',
      });
      await expect(link(framework.id, NO_SUCH_ID)).rejects.toMatchObject({ code: '23503' });
      await expect(placeIn(framework.id, 'NOT_A_FAMILY')).rejects.toMatchObject({
        code: '23514',
        constraint: 'skills_family_check',
      });
      const softMismatch = { code: '23514', constraint: 'skills_soft_skill_family_check' };
      await expect(placeIn(framework.id, 'COMMUNICATION')).rejects.toMatchObject(softMismatch);
      await expect(placeIn(soft.id, 'SQL')).rejects.toMatchObject(softMismatch);
      // A skill without a group has no family yet.
      await expect(placeIn(pending.id, 'SQL')).rejects.toMatchObject(softMismatch);
    });

    it('FR-39 Invariant 11: DB rejects an implication of an unapproved skill and one that closes a cycle', async () => {
      const first = await approvedSkill('Chain one');
      const second = await approvedSkill('Chain two');
      const third = await approvedSkill('Chain three');
      const pending = await pendingSkill('Chain pending');
      const link = (from: number, to: number) =>
        t.db.$client.query('INSERT INTO core.skill_implications (skill_id, implied_skill_id) VALUES ($1, $2)', [from, to]);

      const unapproved = { code: '23514', constraint: 'skill_implications_approved' };
      await expect(link(first.id, pending.id)).rejects.toMatchObject(unapproved);
      await expect(link(pending.id, first.id)).rejects.toMatchObject(unapproved);
      await link(first.id, second.id);
      await link(second.id, third.id);
      await expect(link(third.id, first.id)).rejects.toMatchObject({ code: '23514', constraint: 'skill_implications_acyclic' });
      expect(await impliedIdsOf(third.id)).toEqual([]);
    });
  });

  describe('AC-5, AC-6 approval and taxonomy edits', () => {
    it('FR-39 approve with family and implications; taxonomy patch checks row_version', async () => {
      const [react, javascript, typescript] = await Promise.all(['React', 'JavaScript', 'TypeScript'].map(seedSkill));
      const pending = await pendingSkill('Remix');
      const approved = AdminSkillSchema.parse(
        (
          await approve(pending.id, {
            rowVersion: pending.rowVersion,
            canonicalName: pending.canonicalName,
            group: 'FRAMEWORK',
            family: 'META_FRAMEWORK',
            impliesSkillIds: [react!.id],
          }).expect(200)
        ).body,
      );
      expect(approved).toMatchObject({
        status: 'APPROVED',
        family: 'META_FRAMEWORK',
        zone: 'FRONTEND',
        implies: [ref(react!)],
        rowVersion: pending.rowVersion + 2,
      });
      const [approval] = (await auditEntries(t.db, 'skill', pending.id)).reverse();
      expect(approval).toMatchObject({
        action: 'SKILL_APPROVED',
        actorId: admin.user.id,
        after: { group: 'FRAMEWORK', family: 'META_FRAMEWORK', impliesSkillIds: [react!.id] },
      });

      const stale = await patch(pending.id, { rowVersion: pending.rowVersion, family: null, impliesSkillIds: [] });
      expect(stale.status).toBe(409);
      expect(ApiErrorSchema.parse(stale.body).code).toBe('ROW_VERSION_CONFLICT');
      expect(await rowById(pending.id)).toMatchObject({ family: 'META_FRAMEWORK', rowVersion: approved.rowVersion });

      const edited = AdminSkillSchema.parse(
        (
          await patch(pending.id, {
            rowVersion: approved.rowVersion,
            family: 'SPA_FRAMEWORK',
            impliesSkillIds: [typescript!.id, javascript!.id],
          }).expect(200)
        ).body,
      );
      // Implied skills by name.
      expect(edited).toMatchObject({
        family: 'SPA_FRAMEWORK',
        zone: 'FRONTEND',
        implies: [ref(javascript!), ref(typescript!)],
        rowVersion: approved.rowVersion + 1,
      });
      expect(await impliedIdsOf(pending.id)).toEqual(ascending(javascript!.id, typescript!.id));
      const [update] = await auditEntries(t.db, 'skill', pending.id);
      expect(update).toMatchObject({
        action: 'SKILL_TAXONOMY_UPDATED',
        actorId: admin.user.id,
        before: { family: 'META_FRAMEWORK', impliesSkillIds: [react!.id], rowVersion: approved.rowVersion },
        after: {
          family: 'SPA_FRAMEWORK',
          impliesSkillIds: ascending(javascript!.id, typescript!.id),
          rowVersion: approved.rowVersion + 1,
        },
      });

      // Saving what is stored writes nothing: row_version stays, no audit entry.
      const entries = (await auditEntries(t.db, 'skill', pending.id)).length;
      const unchanged = AdminSkillSchema.parse(
        (
          await patch(pending.id, {
            rowVersion: edited.rowVersion,
            family: 'SPA_FRAMEWORK',
            impliesSkillIds: [javascript!.id, typescript!.id],
          }).expect(200)
        ).body,
      );
      expect(unchanged.rowVersion).toBe(edited.rowVersion);
      expect(await auditEntries(t.db, 'skill', pending.id)).toHaveLength(entries);

      const frontend = await listed({ status: 'APPROVED', zone: 'FRONTEND' });
      expect(frontend.find((skill) => skill.id === pending.id)).toMatchObject({ family: 'SPA_FRAMEWORK' });
      const database = await listed({ status: 'APPROVED', zone: 'DATABASE' });
      expect(database.map((skill) => skill.id)).not.toContain(pending.id);
      expect(database.every((skill) => skill.zone === 'DATABASE')).toBe(true);
      const sql = await seedSkill('SQL');
      expect(database.find((skill) => skill.canonicalName === 'PostgreSQL')).toMatchObject({
        family: 'RELATIONAL_DB',
        implies: [ref(sql)],
      });
      await admin.agent.get(api('admin/skills')).query({ status: 'APPROVED', zone: 'NOT_A_ZONE' }).expect(400);

      // The patch replaces both fields, so it must send both.
      await patch(pending.id, { rowVersion: edited.rowVersion }).expect(400);
      await patch(pending.id, { rowVersion: edited.rowVersion, family: null }).expect(400);
      const cleared = AdminSkillSchema.parse(
        (await patch(pending.id, { rowVersion: edited.rowVersion, family: null, impliesSkillIds: [] }).expect(200)).body,
      );
      expect(cleared).toMatchObject({ family: null, zone: null, implies: [], rowVersion: edited.rowVersion + 1 });
      expect(await impliedIdsOf(pending.id)).toEqual([]);
    });

    it('FR-39 implied skills must be approved; only an approved skill has a taxonomy', async () => {
      const skill = await approvedSkill('Implying');
      const pending = await pendingSkill('Not yet');

      const toPending = await patch(skill.id, { rowVersion: skill.rowVersion, family: null, impliesSkillIds: [pending.id, NO_SUCH_ID] });
      expect(toPending.status).toBe(422);
      expect(ApiErrorSchema.parse(toPending.body)).toMatchObject({
        code: 'SKILL_NOT_APPROVED',
        details: { skillIds: [pending.id, NO_SUCH_ID] },
      });
      expect(await rowById(skill.id)).toMatchObject({ rowVersion: skill.rowVersion });
      expect(await impliedIdsOf(skill.id)).toEqual([]);

      const ofPending = await patch(pending.id, { rowVersion: pending.rowVersion, family: 'SQL', impliesSkillIds: [] });
      expect(ofPending.status).toBe(422);
      expect(ApiErrorSchema.parse(ofPending.body)).toMatchObject({ code: 'SKILL_NOT_APPROVED', details: { skillIds: [pending.id] } });
      await patch(NO_SUCH_ID, { rowVersion: 1, family: null, impliesSkillIds: [] }).expect(404);

      const other = await pendingSkill('Approving');
      const approval = { rowVersion: other.rowVersion, canonicalName: other.canonicalName, group: 'FRAMEWORK' };
      const approveToPending = await approve(other.id, { ...approval, impliesSkillIds: [pending.id] });
      expect(approveToPending.status).toBe(422);
      expect(ApiErrorSchema.parse(approveToPending.body).code).toBe('SKILL_NOT_APPROVED');
      expect(await rowById(other.id)).toMatchObject({ status: 'PENDING', rowVersion: other.rowVersion });
    });

    it('FR-39 a family must fit the group; at most five implied skills, each once', async () => {
      const framework = await approvedSkill('Fitting');
      const soft = await approvedSkill('Fitting soft', 'SOFT_SKILL');
      const invalid = async (response: Promise<{ status: number; body: unknown }>, path: string) => {
        const { status, body } = await response;
        expect(status).toBe(400);
        expect(ApiErrorSchema.parse(body)).toMatchObject({
          code: 'VALIDATION_FAILED',
          details: { issues: [expect.objectContaining({ path })] },
        });
      };

      await invalid(patch(framework.id, { rowVersion: framework.rowVersion, family: 'COMMUNICATION', impliesSkillIds: [] }), 'family');
      await invalid(patch(soft.id, { rowVersion: soft.rowVersion, family: 'SQL', impliesSkillIds: [] }), 'family');
      const sixSkills = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => approvedSkill(`Implied ${n}`)));
      await invalid(
        patch(framework.id, { rowVersion: framework.rowVersion, family: null, impliesSkillIds: sixSkills.map((skill) => skill.id) }),
        'impliesSkillIds',
      );
      await invalid(
        patch(framework.id, { rowVersion: framework.rowVersion, family: null, impliesSkillIds: [soft.id, soft.id] }),
        'impliesSkillIds',
      );
      const pending = await pendingSkill('Soft pending');
      await invalid(
        approve(pending.id, { rowVersion: pending.rowVersion, canonicalName: pending.canonicalName, group: 'SOFT_SKILL', family: 'SQL' }),
        'family',
      );
      expect(await rowById(framework.id)).toMatchObject({ family: null, rowVersion: framework.rowVersion });
      expect(await rowById(soft.id)).toMatchObject({ family: null, rowVersion: soft.rowVersion });

      // The soft-skill competency fits a soft skill.
      await patch(soft.id, { rowVersion: soft.rowVersion, family: 'COMMUNICATION', impliesSkillIds: [] }).expect(200);
    });
  });

  describe('AC-4 cycles', () => {
    it('FR-39 cycle returns 422 and writes nothing', async () => {
      const [a, b, c] = await Promise.all(['Cycle A', 'Cycle B', 'Cycle C'].map((label) => approvedSkill(label)));
      await patch(b!.id, { rowVersion: b!.rowVersion, family: null, impliesSkillIds: [c!.id] }).expect(200);
      await patch(c!.id, { rowVersion: c!.rowVersion, family: null, impliesSkillIds: [a!.id] }).expect(200);

      const closing = await patch(a!.id, { rowVersion: a!.rowVersion, family: 'SPA_FRAMEWORK', impliesSkillIds: [b!.id] });
      expect(closing.status).toBe(422);
      expect(ApiErrorSchema.parse(closing.body)).toMatchObject({
        code: 'SKILL_IMPLICATION_CYCLE',
        details: { path: [ref(a!), ref(b!), ref(c!), ref(a!)] },
      });
      const itself = await patch(a!.id, { rowVersion: a!.rowVersion, family: null, impliesSkillIds: [a!.id] });
      expect(ApiErrorSchema.parse(itself.body)).toMatchObject({
        code: 'SKILL_IMPLICATION_CYCLE',
        details: { path: [ref(a!), ref(a!)] },
      });
      expect(await rowById(a!.id)).toMatchObject({ family: null, rowVersion: a!.rowVersion });
      expect(await impliedIdsOf(a!.id)).toEqual([]);
      expect((await auditEntries(t.db, 'skill', a!.id)).map((entry) => entry.action)).toEqual([]);

      // On approval the path names the skill by its new name.
      const pending = await pendingSkill('Self');
      const newName = uniqueName('Self renamed');
      const self = await approve(pending.id, {
        rowVersion: pending.rowVersion,
        canonicalName: newName,
        group: 'FRAMEWORK',
        impliesSkillIds: [pending.id],
      });
      expect(self.status).toBe(422);
      expect(ApiErrorSchema.parse(self.body)).toMatchObject({
        code: 'SKILL_IMPLICATION_CYCLE',
        details: { path: [{ id: pending.id, canonicalName: newName }, { id: pending.id, canonicalName: newName }] },
      });
      expect(await rowById(pending.id)).toMatchObject({ status: 'PENDING', canonicalName: pending.canonicalName });
    });

    it('FR-39 two edits that together close a cycle run one after the other: one of them gets 422', async () => {
      const [x, y] = await Promise.all(['Race X', 'Race Y'].map((label) => approvedSkill(label)));
      const responses = await Promise.all([
        patch(x!.id, { rowVersion: x!.rowVersion, family: null, impliesSkillIds: [y!.id] }),
        patch(y!.id, { rowVersion: y!.rowVersion, family: null, impliesSkillIds: [x!.id] }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 422]);
      const edges = await t.db
        .select()
        .from(skillImplications)
        .where(inArray(skillImplications.skillId, [x!.id, y!.id]));
      expect(edges).toHaveLength(1);
    });
  });

  describe('AC-8 taxonomy for matching', () => {
    it('FR-39 taxonomy() lists approved skills by id with the closure of their implications', async () => {
      const [z, y, x] = await Promise.all(['Closure Z', 'Closure Y', 'Closure X'].map((label) => approvedSkill(label)));
      await patch(y!.id, { rowVersion: y!.rowVersion, family: 'SPA_FRAMEWORK', impliesSkillIds: [z!.id] }).expect(200);
      await patch(x!.id, { rowVersion: x!.rowVersion, family: null, impliesSkillIds: [y!.id] }).expect(200);
      const pending = await pendingSkill('Closure pending');

      const entries = await t.app.get(SkillCatalogService).taxonomy();
      const ids = entries.map((entry) => entry.skillId);
      expect(ids).toEqual(ascending(...new Set(ids)));
      expect(ids).not.toContain(pending.id);
      const byId = new Map(entries.map((entry) => [entry.skillId, entry]));
      for (const entry of entries) {
        expect(entry.zone).toBe(entry.family === null ? null : FAMILY_ZONE[entry.family]);
        expect(entry.impliedSkillIds).not.toContain(entry.skillId);
        expect(entry.impliedSkillIds.every((id) => byId.has(id))).toBe(true);
      }

      expect(byId.get(x!.id)).toMatchObject({
        canonicalName: x!.canonicalName,
        nameKey: skillMatchKey(x!.canonicalName),
        aliasKeys: [],
        group: 'FRAMEWORK',
        family: null,
        zone: null,
        impliedSkillIds: ascending(y!.id, z!.id),
      });
      expect(byId.get(y!.id)).toMatchObject({ family: 'SPA_FRAMEWORK', zone: 'FRONTEND', impliedSkillIds: [z!.id] });

      const [next, react, javascript, springBoot, springFramework, java] = await Promise.all(
        ['Next.js', 'React', 'JavaScript', 'Spring Boot', 'Spring Framework', 'Java'].map(seedSkill),
      );
      expect(byId.get(next!.id)).toMatchObject({
        family: 'META_FRAMEWORK',
        zone: 'FRONTEND',
        impliedSkillIds: ascending(react!.id, javascript!.id),
      });
      expect(byId.get(springBoot!.id)!.impliedSkillIds).toEqual(ascending(springFramework!.id, java!.id));
    });
  });

  describe('AC-9 roles', () => {
    it('FR-39 only ADMIN edits taxonomy', async () => {
      const skill = await approvedSkill('Guarded');
      for (const role of ['STUDENT', 'HR', 'CENTER'] as const) {
        const { agent } = await t.loginAs(role);
        await agent
          .patch(api(`admin/skills/${skill.id}/taxonomy`))
          .send({ rowVersion: skill.rowVersion, family: 'SPA_FRAMEWORK', impliesSkillIds: [] })
          .expect(403);
        await agent.get(api('admin/skills')).query({ status: 'APPROVED', zone: 'FRONTEND' }).expect(403);
      }
      await t
        .http()
        .patch(api(`admin/skills/${skill.id}/taxonomy`))
        .send({ rowVersion: skill.rowVersion, family: null, impliesSkillIds: [] })
        .expect(401);
      expect(await rowById(skill.id)).toMatchObject({ family: null, rowVersion: skill.rowVersion });
    });
  });
});
