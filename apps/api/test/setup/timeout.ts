// Integration tests start a Nest app, hash passwords and talk to containers; under a full parallel
// run a beforeAll can take well over Jest's 5-second default. `testTimeout` in a `projects` entry is
// ignored (jest-circus reads only the global config, LESSONS §11), so the integration project sets it here.
jest.setTimeout(120_000);
