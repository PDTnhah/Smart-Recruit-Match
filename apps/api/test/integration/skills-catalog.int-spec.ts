// US-2.5 (FR-13, CONTEXT D39): the skill catalogue. New skills named by CV and JD results wait for
// ADMIN with the skill normalizer's suggestion; ADMIN approves, merges or rejects them, with audit
// entries; every role looks up approved skills only. Results are delivered as aigateway delivers
// them, by awaiting `ai.result.<TYPE>`. Test files share one database, so every name is unique.
import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AdminSkillListSchema,
  AdminSkillSchema,
  type AiJobType,
  ApiErrorSchema,
  CatalogSkillListSchema,
  skillMatchKey,
  type SkillSuggestion,
} from '@srm/shared';
import { eq, inArray } from 'drizzle-orm';
import { Client } from 'pg';
import { skills } from '../../src/db/schema/index.js';
import {
  AI_JOB_DISPATCHED,
  AI_RESULT_EVENTS,
  type AiJobDispatchedEvent,
  type AiResultEvent,
} from '../../src/modules/aigateway/index.js';
import { cvParseSucceeded } from '../helpers/ai-results.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';
import { aiDatabaseUrl } from '../helpers/db.js';
import { createSkill } from '../helpers/factories.js';
import { captureEvents, SAMPLE_REQUIREMENTS } from '../helpers/jd.js';
import { auditEntries } from '../helpers/state.js';

/** No CV or JD has this id: their owners ignore the result, the skills module still reads it. */
const NO_SUCH_ID = 2_000_000_000;
const SKILLS_VIEW = 'core.v_ai_skills';
const CANDIDATES_VIEW = 'core.v_ai_skill_candidates';

describe('US-2.5: skill catalogue', () => {
  let t: AuthTestApp;
  let admin: LoggedIn;
  let ai: Client;
  let dispatched: AiJobDispatchedEvent[];

  beforeAll(async () => {
    t = await createAuthTestApp();
    admin = await t.loginAs('ADMIN');
    ai = new Client({ connectionString: aiDatabaseUrl() });
    await ai.connect();
    dispatched = captureEvents(t.app, AI_JOB_DISPATCHED);
  });

  afterAll(async () => {
    await ai.end();
    await t.close();
  });

  /** A name no other test uses (LESSONS §22). */
  const uniqueName = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

  /** As the ai.results consumer does: awaits every listener (CONTEXT D33). */
  const deliver = <T extends AiJobType>(type: T, result: AiResultEvent<T>) =>
    t.app.get(EventEmitter2).emitAsync(AI_RESULT_EVENTS[type], result);

  const cvResult = (newSkills: string[]) =>
    cvParseSucceeded({ id: NO_SUCH_ID, version: 1, fileKey: 'cv/none.pdf' }, { new_skills: newSkills });

  const jdResult = (newSkills: string[]): AiResultEvent<'JD_ANALYZE'> => {
    const jobId = randomUUID();
    return {
      job_id: jobId,
      type: 'JD_ANALYZE',
      status: 'SUCCEEDED',
      job: { job_id: jobId, jd_id: NO_SUCH_ID, jd_version: 1 },
      result: {
        prompt_version: 'jd_analyzer/v1',
        model: 'gemini-3.8-flash',
        jd_id: NO_SUCH_ID,
        jd_version: 1,
        requirements: SAMPLE_REQUIREMENTS,
        position_group: 'BACKEND',
        new_skills: newSkills,
        hidden_text_detected: false,
      },
      error: null,
    };
  };

  const normalized = (skillIds: number[], suggestions: SkillSuggestion[], jobId = randomUUID()) =>
    ({
      job_id: jobId,
      type: 'SKILL_NORMALIZE',
      status: 'SUCCEEDED',
      job: { job_id: jobId, skill_ids: skillIds },
      result: { prompt_version: 'skill_normalizer/v1', model: 'gemini-3.8-flash', suggestions },
      error: null,
    }) satisfies AiResultEvent<'SKILL_NORMALIZE'>;

  const suggestion = (skillId: number, name: string, ...similar: string[]): SkillSuggestion => ({
    skill_id: skillId,
    canonical_name: name,
    group: 'FRAMEWORK',
    similar_skills: similar,
  });

  /** Rows whose key is the key of one of `names`. */
  const rowsByNames = (...names: string[]) =>
    t.db
      .select()
      .from(skills)
      .where(inArray(skills.nameKey, names.map(skillMatchKey)));

  const rowById = async (id: number) => (await t.db.select().from(skills).where(eq(skills.id, id)))[0]!;

  const visibleIn = async (view: string, id: number) =>
    (await ai.query(`SELECT 1 FROM ${view} WHERE skill_id = $1`, [id])).rowCount === 1;

  const jobsFor = (id: number) =>
    dispatched.filter(
      (event): event is AiJobDispatchedEvent<'SKILL_NORMALIZE'> =>
        event.type === 'SKILL_NORMALIZE' && (event.job as { skill_ids: number[] }).skill_ids.includes(id),
    );

  /** A skill awaiting review, as a CV result creates it. */
  const pendingSkill = async (label: string) => {
    const name = uniqueName(label);
    await deliver('CV_PARSE', cvResult([name]));
    const [row] = await rowsByNames(name);
    return row!;
  };

  /** Audit entries of a skill, oldest first. */
  const auditOf = async (id: number) => (await auditEntries(t.db, 'skill', id)).reverse();

  const actionsOf = async (id: number) => (await auditOf(id)).map((entry) => entry.action);

  const seedSkill = async (name: string) => (await rowsByNames(name))[0]!;

  describe('AC-5 new skills await review', () => {
    it('FR-13 kỹ năng mới vào trạng thái chờ duyệt, không có trong v_ai_skills', async () => {
      const name = uniqueName('Rust embedded');
      const sameKey = name.replace(' ', '-').toUpperCase();
      // ReactJS is an alias of the seeded React: never queued, whatever the result says.
      await deliver('CV_PARSE', cvResult([name, sameKey, 'ReactJS']));

      const rows = await rowsByNames(name, 'ReactJS');
      expect(rows).toHaveLength(1);
      const [row] = rows;
      expect(row).toMatchObject({ canonicalName: name, status: 'PENDING', group: null, aliases: [], suggestion: null });
      expect(await visibleIn(SKILLS_VIEW, row!.id)).toBe(false);
      expect(await visibleIn(CANDIDATES_VIEW, row!.id)).toBe(true);

      // AC-6: after commit, one suggestion job for it.
      expect(jobsFor(row!.id).map((event) => event.job.skill_ids)).toEqual([[row!.id]]);
      const [proposed] = await auditOf(row!.id);
      expect(proposed).toMatchObject({ action: 'SKILL_PROPOSED', actorKind: 'SYSTEM' });
      expect(proposed!.after).toMatchObject({ source: 'CV_PARSE', status: 'PENDING' });
    });

    it('FR-13 kết quả giao hai lần chỉ tạo một dòng, một job; kỹ năng mới của JD cũng vào hàng chờ', async () => {
      const name = uniqueName('Zig');
      const result = cvResult([name]);
      await deliver('CV_PARSE', result);
      await deliver('CV_PARSE', result);
      const [row] = await rowsByNames(name);
      expect(await rowsByNames(name)).toHaveLength(1);
      expect(jobsFor(row!.id)).toHaveLength(1);

      const fromJd = uniqueName('Elixir');
      await deliver('JD_ANALYZE', jdResult([fromJd]));
      const [jdRow] = await rowsByNames(fromJd);
      expect(jdRow).toMatchObject({ status: 'PENDING' });
      expect(await actionsOf(jdRow!.id)).toEqual(['SKILL_PROPOSED']);
    });

    it('FR-13 hơn 50 kỹ năng mới tách thành nhiều job, mỗi job tối đa 50', async () => {
      const names = Array.from({ length: 51 }, (_, index) => uniqueName(`Batch ${index}`));
      await deliver('CV_PARSE', cvResult(names));
      const ids = (await rowsByNames(...names)).map((row) => row.id);
      expect(ids).toHaveLength(51);
      const jobs = dispatched.filter(
        (event) =>
          event.type === 'SKILL_NORMALIZE' &&
          (event.job as { skill_ids: number[] }).skill_ids.some((id) => ids.includes(id)),
      );
      expect(jobs.map((event) => (event.job as { skill_ids: number[] }).skill_ids.length)).toEqual([50, 1]);
    });
  });

  describe('AC-6 suggestions', () => {
    it('FR-13 gợi ý lưu kèm model và prompt khi kỹ năng còn chờ duyệt; giữ gợi ý đầu tiên', async () => {
      const pending = await pendingSkill('reactjs native');
      const outsideJob = await pendingSkill('Outside');
      const reviewed = await pendingSkill('Reviewed');
      await admin.agent
        .post(api(`admin/skills/${reviewed.id}/reject`))
        .send({ rowVersion: reviewed.rowVersion })
        .expect(200);

      await deliver(
        'SKILL_NORMALIZE',
        normalized(
          [pending.id, reviewed.id],
          [
            suggestion(pending.id, ' React Native ', 'React'),
            suggestion(reviewed.id, 'Reviewed'),
            suggestion(outsideJob.id, 'Outside'),
          ],
        ),
      );
      // A duplicate delivery, then a FAILED job: neither changes what is stored.
      await deliver('SKILL_NORMALIZE', normalized([pending.id], [suggestion(pending.id, 'Other name')]));
      const failedJob = randomUUID();
      await deliver('SKILL_NORMALIZE', {
        job_id: failedJob,
        type: 'SKILL_NORMALIZE',
        status: 'FAILED',
        job: { job_id: failedJob, skill_ids: [outsideJob.id] },
        result: null,
        error: { code: 'LLM_REFUSED', message: 'refused', needs_human: false },
      });

      const list = AdminSkillListSchema.parse((await admin.agent.get(api('admin/skills')).expect(200)).body);
      const shown = list.items.find((item) => item.id === pending.id);
      expect(shown?.suggestion).toEqual({
        canonicalName: 'React Native',
        group: 'FRAMEWORK',
        similarSkills: ['React'],
        model: 'gemini-3.8-flash',
        promptVersion: 'skill_normalizer/v1',
      });
      // The suggestion is advice: the row keeps its name, status and row_version (AD-2).
      expect(shown).toMatchObject({ canonicalName: pending.canonicalName, status: 'PENDING', rowVersion: pending.rowVersion });
      expect(list.items.find((item) => item.id === outsideJob.id)?.suggestion).toBeNull();
      expect((await rowById(reviewed.id)).suggestion).toBeNull();
      expect(await actionsOf(pending.id)).toEqual(['SKILL_PROPOSED', 'SKILL_SUGGESTED']);
    });
  });

  describe('AC-7 ADMIN review', () => {
    it('FR-13 duyệt kèm đổi tên: tên gốc thành alias, có trong v_ai_skills, có audit, không vào hàng chờ lần nữa', async () => {
      const pending = await pendingSkill('reactjs native');
      const newName = uniqueName('React Native');
      const response = await admin.agent
        .post(api(`admin/skills/${pending.id}/approve`))
        .send({ rowVersion: pending.rowVersion, canonicalName: ` ${newName} `, group: 'FRAMEWORK' })
        .expect(200);

      expect(AdminSkillSchema.parse(response.body)).toMatchObject({
        id: pending.id,
        canonicalName: newName,
        aliases: [pending.canonicalName],
        group: 'FRAMEWORK',
        status: 'APPROVED',
        rowVersion: pending.rowVersion + 2,
      });
      const { rows } = await ai.query(`SELECT canonical_name, aliases, "group" FROM ${SKILLS_VIEW} WHERE skill_id = $1`, [
        pending.id,
      ]);
      expect(rows).toEqual([{ canonical_name: newName, aliases: [pending.canonicalName], group: 'FRAMEWORK' }]);
      expect(await visibleIn(CANDIDATES_VIEW, pending.id)).toBe(false);

      // Reviewed skills list the latest decision first, so this one is on the page whatever the seed.
      const approved = AdminSkillListSchema.parse(
        (await admin.agent.get(api('admin/skills')).query({ status: 'APPROVED' }).expect(200)).body,
      ).items;
      expect(approved.map((skill) => skill.id)).toContain(pending.id);
      const updated = approved.map((skill) => Date.parse(skill.updatedAt));
      expect(updated).toEqual([...updated].sort((a, b) => b - a));

      const entries = await auditOf(pending.id);
      expect(entries.map((entry) => [entry.action, entry.actorId])).toEqual([
        ['SKILL_PROPOSED', null],
        ['SKILL_APPROVED', admin.user.id],
        ['TRANSITION', admin.user.id],
      ]);
      expect(entries[2]!.after).toMatchObject({ status: 'APPROVED' });

      // AC-10: the next result naming either spelling finds the skill instead of queuing it.
      await deliver('CV_PARSE', cvResult([pending.canonicalName, newName.toLowerCase()]));
      expect((await rowsByNames(pending.canonicalName, newName)).map((row) => row.id)).toEqual([pending.id]);
    });

    it('FR-13 duyệt với rowVersion cũ trả 409; tên trùng kỹ năng có sẵn trả 409 SKILL_NAME_TAKEN', async () => {
      const pending = await pendingSkill('Stale');
      const approve = (body: object) => admin.agent.post(api(`admin/skills/${pending.id}/approve`)).send(body);

      const stale = await approve({ rowVersion: pending.rowVersion + 1, canonicalName: uniqueName('X'), group: 'OTHER' });
      expect(stale.status).toBe(409);
      expect(ApiErrorSchema.parse(stale.body).code).toBe('ROW_VERSION_CONFLICT');

      // "React.js" shares its key with ReactJS, an alias of the seeded React.
      const react = await seedSkill('React');
      const taken = await approve({ rowVersion: pending.rowVersion, canonicalName: 'React.js', group: 'FRAMEWORK' });
      expect(taken.status).toBe(409);
      expect(ApiErrorSchema.parse(taken.body)).toMatchObject({
        code: 'SKILL_NAME_TAKEN',
        details: { skillId: react.id, canonicalName: 'React', status: 'APPROVED' },
      });

      const blank = await approve({ rowVersion: pending.rowVersion, canonicalName: ' .-/ ', group: 'OTHER' });
      expect(blank.status).toBe(400);
      expect(await rowById(pending.id)).toMatchObject({ status: 'PENDING', rowVersion: pending.rowVersion });
    });

    it('FR-13 gộp: tên thành alias của kỹ năng đích, đích tăng row_version, có audit', async () => {
      const target = await createSkill(t.db, { canonicalName: uniqueName('Target'), group: 'FRAMEWORK' });
      const pending = await pendingSkill('Target js');
      const response = await admin.agent
        .post(api(`admin/skills/${pending.id}/merge`))
        .send({ rowVersion: pending.rowVersion, targetId: target.id })
        .expect(200);

      expect(AdminSkillSchema.parse(response.body)).toMatchObject({
        status: 'MERGED',
        mergedInto: { id: target.id, canonicalName: target.canonicalName },
        rowVersion: pending.rowVersion + 2,
      });
      expect(await rowById(target.id)).toMatchObject({
        aliases: [pending.canonicalName],
        aliasKeys: [skillMatchKey(pending.canonicalName)],
        status: 'APPROVED',
        rowVersion: target.rowVersion + 1,
      });
      const { rows } = await ai.query(`SELECT aliases FROM ${SKILLS_VIEW} WHERE skill_id = $1`, [target.id]);
      expect(rows).toEqual([{ aliases: [pending.canonicalName] }]);
      expect(await visibleIn(CANDIDATES_VIEW, pending.id)).toBe(false);
      expect(await actionsOf(pending.id)).toEqual(['SKILL_PROPOSED', 'SKILL_MERGED', 'TRANSITION']);
      expect(await actionsOf(target.id)).toEqual(['SKILL_ALIASES_ADDED']);

      // AC-10
      await deliver('CV_PARSE', cvResult([pending.canonicalName]));
      expect(await rowsByNames(pending.canonicalName)).toHaveLength(1);
    });

    it('FR-13 gộp vào kỹ năng chưa duyệt, chính nó hoặc không tồn tại trả 422', async () => {
      const source = await pendingSkill('Source');
      const other = await pendingSkill('Other pending');
      for (const targetId of [other.id, source.id, NO_SUCH_ID]) {
        const response = await admin.agent
          .post(api(`admin/skills/${source.id}/merge`))
          .send({ rowVersion: source.rowVersion, targetId })
          .expect(422);
        expect(ApiErrorSchema.parse(response.body)).toMatchObject({
          code: 'TRANSITION_CONDITION_FAILED',
          details: { reasonCode: 'MERGE_TARGET_NOT_APPROVED' },
        });
      }
      expect(await rowById(source.id)).toMatchObject({ status: 'PENDING', mergedIntoId: null });
    });

    it('FR-13 từ chối: REJECTED có audit, không vào hàng chờ lần nữa; quyết định không đổi lại được', async () => {
      const pending = await pendingSkill('Rejected');
      const response = await admin.agent
        .post(api(`admin/skills/${pending.id}/reject`))
        .send({ rowVersion: pending.rowVersion })
        .expect(200);
      const rejected = AdminSkillSchema.parse(response.body);
      expect(rejected).toMatchObject({ status: 'REJECTED', rowVersion: pending.rowVersion + 1 });
      const [, transition] = await auditOf(pending.id);
      expect(transition).toMatchObject({ action: 'TRANSITION', reason: 'Rejected by ADMIN', actorId: admin.user.id });

      await deliver('CV_PARSE', cvResult([pending.canonicalName]));
      expect(await rowsByNames(pending.canonicalName)).toHaveLength(1);

      const listed = AdminSkillListSchema.parse(
        (await admin.agent.get(api('admin/skills')).query({ status: 'REJECTED' }).expect(200)).body,
      );
      expect(listed.items.map((item) => item.id)).toContain(pending.id);
      const pendingList = AdminSkillListSchema.parse((await admin.agent.get(api('admin/skills')).expect(200)).body);
      expect(pendingList.items.map((item) => item.id)).not.toContain(pending.id);

      const again = await admin.agent
        .post(api(`admin/skills/${pending.id}/approve`))
        .send({ rowVersion: rejected.rowVersion, canonicalName: pending.canonicalName, group: 'OTHER' });
      expect(again.status).toBe(422);
      expect(ApiErrorSchema.parse(again.body).code).toBe('INVALID_TRANSITION');
    });
  });

  describe('AC-8 roles and lookup', () => {
    it('FR-13 vai trò khác ADMIN nhận 403; tra cứu chỉ trả kỹ năng đã duyệt', async () => {
      const pending = await pendingSkill('Hidden');
      for (const role of ['STUDENT', 'HR', 'CENTER'] as const) {
        const { agent } = await t.loginAs(role);
        await agent.get(api('admin/skills')).expect(403);
        for (const action of ['approve', 'merge', 'reject']) {
          await agent
            .post(api(`admin/skills/${pending.id}/${action}`))
            .send({ rowVersion: pending.rowVersion, canonicalName: 'X', group: 'OTHER', targetId: 1 })
            .expect(403);
        }
        const found = CatalogSkillListSchema.parse(
          (await agent.get(api('skills')).query({ query: pending.canonicalName }).expect(200)).body,
        );
        expect(found.items).toEqual([]);
        const react = CatalogSkillListSchema.parse(
          (await agent.get(api('skills')).query({ query: 'react js', limit: 5 }).expect(200)).body,
        );
        // By the key of its alias ReactJS, ahead of skills whose keys only contain "reactjs".
        expect(react.items[0]).toMatchObject({ canonicalName: 'React', group: 'FRAMEWORK', aliases: ['ReactJS'] });
      }
      expect(await rowById(pending.id)).toMatchObject({ status: 'PENDING' });
      await t.http().get(api('skills')).expect(401);
    });
  });

  describe('AC-2 ai.embeddings, seed', () => {
    it('AD-11 ai.embeddings upsert không trùng, có index HNSW', async () => {
      const vector = (value: number) => `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? value : 0)).join(',')}]`;
      const upsert = (value: number) =>
        ai.query(
          `INSERT INTO ai.embeddings (owner_type, owner_id, version, model, embedding)
           VALUES ('cv', $1, 1, 'hashing-v1', $2)
           ON CONFLICT ON CONSTRAINT embeddings_owner_key
           DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()`,
          [NO_SUCH_ID, vector(value)],
        );
      await upsert(1);
      await upsert(0.5);
      const { rows } = await ai.query<{ first: number }>(
        `SELECT (embedding::real[])[1] AS first FROM ai.embeddings
         WHERE owner_type = 'cv' AND owner_id = $1 AND version = 1 AND model = 'hashing-v1'`,
        [NO_SUCH_ID],
      );
      expect(rows).toEqual([{ first: 0.5 }]);

      const indexes = await ai.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'ai' AND tablename = 'embeddings'
         AND indexdef LIKE '%USING hnsw%' ORDER BY indexname`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        ['cv', 'essay', 'jd', 'question', 'skill'].map((type) => `embeddings_${type}_hnsw_idx`),
      );
      for (const row of indexes.rows) expect(row.indexdef).toContain('vector_cosine_ops');
    });

    it('GĐ2 danh mục seed: name_key = skillMatchKey(canonical_name), không hai kỹ năng nào trùng một cách viết', async () => {
      // The seed is one INSERT of migration 0015, so its rows share the earliest created_at.
      const { rows } = await t.db.$client.query<{
        id: string;
        canonical_name: string;
        name_key: string;
        aliases: string[];
        alias_keys: string[];
      }>(
        `SELECT id, canonical_name, name_key, aliases, alias_keys FROM core.skills
         WHERE status = 'APPROVED' AND created_at = (SELECT min(created_at) FROM core.skills)`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(150);
      const owners = new Map<string, string>();
      for (const row of rows) {
        expect([row.canonical_name, row.name_key]).toEqual([row.canonical_name, skillMatchKey(row.canonical_name)]);
        // Migration 0016 filled alias_keys with skillMatchKey written in SQL.
        expect([row.canonical_name, row.alias_keys]).toEqual([row.canonical_name, row.aliases.map(skillMatchKey)]);
        for (const name of [row.canonical_name, ...row.aliases]) {
          const key = skillMatchKey(name);
          expect([name, owners.get(key) ?? row.id]).toEqual([name, row.id]);
          owners.set(key, row.id);
        }
      }
    });

    it('FR-13 Invariant 11: DB chặn hai kỹ năng khớp cùng một key, kể cả khi ghi ngoài API', async () => {
      const insert = (name: string, aliases: string[], aliasKeys = aliases.map(skillMatchKey)) =>
        t.db.$client.query(
          `INSERT INTO core.skills (canonical_name, name_key, aliases, alias_keys, "group", status)
           VALUES ($1, $2, $3, $4, 'OTHER', 'APPROVED')`,
          [name, skillMatchKey(name), aliases, aliasKeys],
        );
      const taken = { code: '23505', constraint: 'skills_keys_distinct' };
      const owner = uniqueName('Owner');
      const alias = uniqueName('Alias');
      await insert(owner, [alias]);

      // An alias key that is another skill's alias key or name key; a name key that is another
      // skill's alias key. A merged skill's name as its target's alias is the one allowed case
      // (the merge test above).
      await expect(insert(uniqueName('Other'), [alias.toUpperCase()])).rejects.toMatchObject(taken);
      await expect(insert(uniqueName('Other'), [`${owner}.`])).rejects.toMatchObject(taken);
      await expect(insert(alias.replaceAll(' ', '-'), [])).rejects.toMatchObject(taken);
      await expect(insert(uniqueName('Other'), ['X'], [])).rejects.toMatchObject({
        code: '23514',
        constraint: 'skills_alias_keys_check',
      });
    });
  });
});
