-- Hand-written seed of the skill taxonomy (US-2.7, FR-39, CONTEXT D43). Keys are skillMatchKey of
-- each name, written out; skill-taxonomy.int-spec.ts checks the result. A count that differs from
-- the table approved in the plan stops the migration, so a mistyped key cannot drop a row unseen.

-- The family of each of the 174 skills seeded by 0015.
DO $$
DECLARE
  placed integer;
BEGIN
  UPDATE core.skills AS s SET family = v.family
  FROM (VALUES
    -- FOUNDATION
    ('c', 'SYSTEMS_LANGUAGE'),
    ('c++', 'SYSTEMS_LANGUAGE'),
    ('rust', 'SYSTEMS_LANGUAGE'),
    ('java', 'MANAGED_LANGUAGE'),
    ('c#', 'MANAGED_LANGUAGE'),
    ('kotlin', 'MANAGED_LANGUAGE'),
    ('scala', 'MANAGED_LANGUAGE'),
    ('go', 'MANAGED_LANGUAGE'),
    ('python', 'SCRIPTING_LANGUAGE'),
    ('php', 'SCRIPTING_LANGUAGE'),
    ('ruby', 'SCRIPTING_LANGUAGE'),
    ('objectorientedprogramming', 'SOFTWARE_DESIGN'),
    ('designpatterns', 'SOFTWARE_DESIGN'),
    ('solid', 'SOFTWARE_DESIGN'),
    ('cleancode', 'SOFTWARE_DESIGN'),
    ('datastructuresandalgorithms', 'ALGORITHMS'),
    ('git', 'VERSION_CONTROL'),
    ('github', 'VERSION_CONTROL'),
    ('gitlab', 'VERSION_CONTROL'),
    ('visualstudiocode', 'IDE'),
    ('intellijidea', 'IDE'),
    ('english', 'FOREIGN_LANGUAGE'),
    ('japanese', 'FOREIGN_LANGUAGE'),
    -- BACKEND
    ('nodejs', 'BACKEND_FRAMEWORK'),
    ('expressjs', 'BACKEND_FRAMEWORK'),
    ('nestjs', 'BACKEND_FRAMEWORK'),
    ('springboot', 'BACKEND_FRAMEWORK'),
    ('springframework', 'BACKEND_FRAMEWORK'),
    ('django', 'BACKEND_FRAMEWORK'),
    ('flask', 'BACKEND_FRAMEWORK'),
    ('fastapi', 'BACKEND_FRAMEWORK'),
    ('laravel', 'BACKEND_FRAMEWORK'),
    ('rubyonrails', 'BACKEND_FRAMEWORK'),
    ('aspnetcore', 'BACKEND_FRAMEWORK'),
    ('net', 'BACKEND_FRAMEWORK'),
    ('hibernate', 'ORM'),
    ('restapi', 'WEB_API'),
    ('graphql', 'WEB_API'),
    ('websocket', 'WEB_API'),
    ('swagger', 'WEB_API'),
    ('rabbitmq', 'MESSAGE_BROKER'),
    ('apachekafka', 'MESSAGE_BROKER'),
    ('microservices', 'SOFTWARE_ARCHITECTURE'),
    ('maven', 'JVM_BUILD_TOOL'),
    ('gradle', 'JVM_BUILD_TOOL'),
    -- FRONTEND
    ('javascript', 'JS_TS'),
    ('typescript', 'JS_TS'),
    ('html', 'WEB_MARKUP_STYLING'),
    ('css', 'WEB_MARKUP_STYLING'),
    ('tailwindcss', 'WEB_MARKUP_STYLING'),
    ('bootstrap', 'WEB_MARKUP_STYLING'),
    ('react', 'SPA_FRAMEWORK'),
    ('vuejs', 'SPA_FRAMEWORK'),
    ('angular', 'SPA_FRAMEWORK'),
    ('svelte', 'SPA_FRAMEWORK'),
    ('nextjs', 'META_FRAMEWORK'),
    ('nuxtjs', 'META_FRAMEWORK'),
    ('jquery', 'DOM_LIBRARY'),
    ('redux', 'STATE_MANAGEMENT'),
    ('webpack', 'FRONTEND_BUILD'),
    ('vite', 'FRONTEND_BUILD'),
    ('uiuxdesign', 'UI_DESIGN'),
    ('figma', 'UI_DESIGN'),
    ('adobephotoshop', 'UI_DESIGN'),
    -- MOBILE
    ('android', 'NATIVE_MOBILE_PLATFORM'),
    ('ios', 'NATIVE_MOBILE_PLATFORM'),
    ('jetpackcompose', 'NATIVE_UI_TOOLKIT'),
    ('swiftui', 'NATIVE_UI_TOOLKIT'),
    ('swift', 'MOBILE_LANGUAGE'),
    ('objectivec', 'MOBILE_LANGUAGE'),
    ('dart', 'MOBILE_LANGUAGE'),
    ('reactnative', 'CROSS_PLATFORM_MOBILE'),
    ('flutter', 'CROSS_PLATFORM_MOBILE'),
    -- DATABASE
    ('sql', 'SQL'),
    ('postgresql', 'RELATIONAL_DB'),
    ('mysql', 'RELATIONAL_DB'),
    ('sqlserver', 'RELATIONAL_DB'),
    ('oracledatabase', 'RELATIONAL_DB'),
    ('sqlite', 'RELATIONAL_DB'),
    ('mariadb', 'RELATIONAL_DB'),
    ('mongodb', 'NOSQL_DB'),
    ('redis', 'NOSQL_DB'),
    ('elasticsearch', 'NOSQL_DB'),
    ('cassandra', 'NOSQL_DB'),
    ('firebase', 'NOSQL_DB'),
    ('dynamodb', 'NOSQL_DB'),
    ('neo4j', 'NOSQL_DB'),
    -- DATA_AI
    ('machinelearning', 'AI_FIELD'),
    ('deeplearning', 'AI_FIELD'),
    ('naturallanguageprocessing', 'AI_FIELD'),
    ('computervision', 'AI_FIELD'),
    ('largelanguagemodels', 'AI_FIELD'),
    ('scikitlearn', 'ML_FRAMEWORK'),
    ('tensorflow', 'ML_FRAMEWORK'),
    ('pytorch', 'ML_FRAMEWORK'),
    ('keras', 'ML_FRAMEWORK'),
    ('opencv', 'ML_FRAMEWORK'),
    ('pandas', 'PYTHON_DATA_TOOL'),
    ('numpy', 'PYTHON_DATA_TOOL'),
    ('matplotlib', 'PYTHON_DATA_TOOL'),
    ('jupyternotebook', 'PYTHON_DATA_TOOL'),
    ('dataanalysis', 'DATA_ANALYTICS'),
    ('datavisualization', 'DATA_ANALYTICS'),
    ('statistics', 'DATA_ANALYTICS'),
    ('r', 'NUMERIC_LANGUAGE'),
    ('matlab', 'NUMERIC_LANGUAGE'),
    ('powerbi', 'BI_TOOL'),
    ('tableau', 'BI_TOOL'),
    ('microsoftexcel', 'BI_TOOL'),
    ('etl', 'DATA_ENGINEERING'),
    ('datawarehouse', 'DATA_ENGINEERING'),
    ('apacheairflow', 'DATA_ENGINEERING'),
    ('apachespark', 'BIG_DATA'),
    ('apachehadoop', 'BIG_DATA'),
    -- DEVOPS_CLOUD
    ('docker', 'CONTAINERIZATION'),
    ('kubernetes', 'CONTAINERIZATION'),
    ('aws', 'CLOUD_PROVIDER'),
    ('microsoftazure', 'CLOUD_PROVIDER'),
    ('googlecloudplatform', 'CLOUD_PROVIDER'),
    ('cicd', 'CI_CD'),
    ('devops', 'CI_CD'),
    ('jenkins', 'CI_CD'),
    ('githubactions', 'CI_CD'),
    ('gitlabci', 'CI_CD'),
    ('terraform', 'IAC'),
    ('ansible', 'IAC'),
    ('linux', 'LINUX_SHELL'),
    ('bash', 'LINUX_SHELL'),
    ('nginx', 'WEB_SERVER'),
    ('prometheus', 'MONITORING'),
    ('grafana', 'MONITORING'),
    -- TESTING_QA
    ('manualtesting', 'MANUAL_QA'),
    ('testcasedesign', 'MANUAL_QA'),
    ('automationtesting', 'TEST_AUTOMATION'),
    ('selenium', 'TEST_AUTOMATION'),
    ('cypress', 'TEST_AUTOMATION'),
    ('playwright', 'TEST_AUTOMATION'),
    ('appium', 'TEST_AUTOMATION'),
    ('unittesting', 'UNIT_TESTING'),
    ('junit', 'UNIT_TESTING'),
    ('testng', 'UNIT_TESTING'),
    ('mockito', 'UNIT_TESTING'),
    ('jest', 'UNIT_TESTING'),
    ('pytest', 'UNIT_TESTING'),
    ('testdrivendevelopment', 'UNIT_TESTING'),
    ('apitesting', 'API_TESTING'),
    ('postman', 'API_TESTING'),
    ('performancetesting', 'PERFORMANCE_TESTING'),
    ('jmeter', 'PERFORMANCE_TESTING'),
    -- BUSINESS_ANALYSIS
    ('requirementsanalysis', 'REQUIREMENTS'),
    ('userstories', 'REQUIREMENTS'),
    ('uml', 'MODELING_NOTATION'),
    ('bpmn', 'MODELING_NOTATION'),
    -- PROCESS
    ('agile', 'SOFTWARE_PROCESS'),
    ('scrum', 'SOFTWARE_PROCESS'),
    ('kanban', 'SOFTWARE_PROCESS'),
    ('waterfall', 'SOFTWARE_PROCESS'),
    ('jira', 'PROJECT_TOOL'),
    ('confluence', 'PROJECT_TOOL'),
    ('trello', 'PROJECT_TOOL'),
    -- SECURITY_NETWORK
    ('computernetworks', 'NETWORKING'),
    ('informationsecurity', 'INFORMATION_SECURITY'),
    -- EMBEDDED_IOT
    ('embeddedsystems', 'EMBEDDED_SYSTEMS'),
    ('iot', 'EMBEDDED_SYSTEMS'),
    -- GAME_DEV
    ('unity', 'GAME_ENGINE'),
    -- BLOCKCHAIN
    ('blockchain', 'BLOCKCHAIN_PLATFORM'),
    -- SOFT_SKILL
    ('communication', 'COMMUNICATION'),
    ('teamwork', 'TEAMWORK'),
    ('leadership', 'LEADERSHIP'),
    ('problemsolving', 'PROBLEM_SOLVING'),
    ('presentation', 'PRESENTATION'),
    ('criticalthinking', 'CRITICAL_THINKING'),
    ('selflearning', 'SELF_LEARNING'),
    ('timemanagement', 'TIME_MANAGEMENT')
  ) AS v(name_key, family)
  WHERE s.name_key = v.name_key AND s.status = 'APPROVED';
  GET DIAGNOSTICS placed = ROW_COUNT;
  IF placed <> 174 THEN
    RAISE EXCEPTION 'expected 174 seeded skills to get a family, got %', placed;
  END IF;
END $$;
--> statement-breakpoint

-- Five standard soft skills (PRD › Kỹ năng mềm) with their Vietnamese name as alias. A name whose
-- key another skill already owns (an ADMIN entry on a dev database) is skipped with a notice;
-- approving that skill with the family gives the same catalogue.
DO $$
DECLARE
  added integer;
BEGIN
  INSERT INTO core.skills (canonical_name, name_key, aliases, alias_keys, "group", family, status)
  SELECT v.canonical_name, v.name_key, ARRAY[v.alias], ARRAY[v.alias_key], 'SOFT_SKILL', v.family, 'APPROVED'
  FROM (VALUES
    ('Proactiveness', 'proactiveness', 'Chủ động', 'chủđộng', 'PROACTIVENESS'),
    ('Responsibility', 'responsibility', 'Tinh thần trách nhiệm', 'tinhthầntráchnhiệm', 'RESPONSIBILITY'),
    ('Adaptability', 'adaptability', 'Thích nghi', 'thíchnghi', 'ADAPTABILITY'),
    ('Stress Tolerance', 'stresstolerance', 'Chịu áp lực', 'chịuáplực', 'ADAPTABILITY'),
    ('Attention to Detail', 'attentiontodetail', 'Cẩn thận tỉ mỉ', 'cẩnthậntỉmỉ', 'ATTENTION_TO_DETAIL')
  ) AS v(canonical_name, name_key, alias, alias_key, family)
  WHERE NOT EXISTS (
    SELECT 1 FROM core.skills AS o
    WHERE o.canonical_name = v.canonical_name
      OR o.name_key IN (v.name_key, v.alias_key)
      OR o.alias_keys && ARRAY[v.name_key, v.alias_key]
  );
  GET DIAGNOSTICS added = ROW_COUNT;
  IF added <> 5 THEN
    RAISE NOTICE 'skipped % of 5 soft skills whose key another skill owns', 5 - added;
  END IF;
END $$;
--> statement-breakpoint

-- "Ham học hỏi" names Self-learning too.
UPDATE core.skills SET aliases = aliases || 'Ham học hỏi'::text, alias_keys = alias_keys || 'hamhọchỏi'::text
WHERE name_key = 'selflearning' AND status = 'APPROVED'
  AND NOT EXISTS (
    SELECT 1 FROM core.skills AS o WHERE o.name_key = 'hamhọchỏi' OR o.alias_keys @> ARRAY['hamhọchỏi']
  );
--> statement-breakpoint

-- 81 implications: using the first skill means using the second. Only certain ones: no
-- React Native ⇒ React, Large Language Models ⇒ NLP, Gradle ⇒ Java.
DO $$
DECLARE
  linked integer;
BEGIN
  INSERT INTO core.skill_implications (skill_id, implied_skill_id)
  SELECT a.id, b.id
  FROM (VALUES
    -- Web, JavaScript
    ('typescript', 'javascript'),
    ('nodejs', 'javascript'),
    ('react', 'javascript'),
    ('vuejs', 'javascript'),
    ('svelte', 'javascript'),
    ('jquery', 'javascript'),
    ('redux', 'javascript'),
    ('reactnative', 'javascript'),
    ('angular', 'typescript'),
    ('expressjs', 'nodejs'),
    ('nestjs', 'nodejs'),
    ('nestjs', 'typescript'),
    ('nextjs', 'react'),
    ('nuxtjs', 'vuejs'),
    ('tailwindcss', 'css'),
    ('bootstrap', 'css'),
    -- JVM, .NET, Python, PHP, Ruby
    ('springboot', 'springframework'),
    ('springframework', 'java'),
    ('hibernate', 'java'),
    ('maven', 'java'),
    ('django', 'python'),
    ('flask', 'python'),
    ('fastapi', 'python'),
    ('laravel', 'php'),
    ('rubyonrails', 'ruby'),
    ('aspnetcore', 'net'),
    ('net', 'c#'),
    -- Mobile
    ('flutter', 'dart'),
    ('jetpackcompose', 'kotlin'),
    ('jetpackcompose', 'android'),
    ('swiftui', 'swift'),
    ('swiftui', 'ios'),
    -- Databases
    ('postgresql', 'sql'),
    ('mysql', 'sql'),
    ('sqlserver', 'sql'),
    ('oracledatabase', 'sql'),
    ('sqlite', 'sql'),
    ('mariadb', 'sql'),
    -- DevOps, version control
    ('kubernetes', 'docker'),
    ('jenkins', 'cicd'),
    ('githubactions', 'cicd'),
    ('gitlabci', 'cicd'),
    ('github', 'git'),
    ('gitlab', 'git'),
    -- Testing
    ('junit', 'java'),
    ('junit', 'unittesting'),
    ('testng', 'java'),
    ('mockito', 'java'),
    ('mockito', 'unittesting'),
    ('jest', 'javascript'),
    ('jest', 'unittesting'),
    ('pytest', 'python'),
    ('pytest', 'unittesting'),
    ('testdrivendevelopment', 'unittesting'),
    ('selenium', 'automationtesting'),
    ('cypress', 'automationtesting'),
    ('playwright', 'automationtesting'),
    ('appium', 'automationtesting'),
    ('jmeter', 'performancetesting'),
    -- Data, AI
    ('deeplearning', 'machinelearning'),
    ('scikitlearn', 'machinelearning'),
    ('scikitlearn', 'python'),
    ('tensorflow', 'deeplearning'),
    ('tensorflow', 'python'),
    ('pytorch', 'deeplearning'),
    ('pytorch', 'python'),
    ('keras', 'deeplearning'),
    ('keras', 'python'),
    ('pandas', 'python'),
    ('numpy', 'python'),
    ('matplotlib', 'python'),
    ('matplotlib', 'datavisualization'),
    ('powerbi', 'datavisualization'),
    ('tableau', 'datavisualization'),
    ('apacheairflow', 'etl'),
    ('apacheairflow', 'python'),
    -- Process, analysis, design
    ('scrum', 'agile'),
    ('kanban', 'agile'),
    ('userstories', 'requirementsanalysis'),
    ('designpatterns', 'objectorientedprogramming'),
    ('solid', 'objectorientedprogramming')
  ) AS v(skill_key, implied_key)
  JOIN core.skills AS a ON a.name_key = v.skill_key AND a.status = 'APPROVED'
  JOIN core.skills AS b ON b.name_key = v.implied_key AND b.status = 'APPROVED';
  GET DIAGNOSTICS linked = ROW_COUNT;
  IF linked <> 81 THEN
    RAISE EXCEPTION 'expected 81 seeded implications, got %', linked;
  END IF;
END $$;
