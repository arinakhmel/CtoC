Analyze the architecture, tech stack, dependencies, and existing features of this repository. Based on your findings, create a concise, practical testing strategy document at `docs/testing-strategy.md` (strictly 1–2 pages long, zero generic theoretical fluff—everything must apply specifically to our codebase).

Structure the document into these three clear sections:

1. **Scope (Automated vs. Manual)**:
   - Specify which core user flows, business logic, validation rules, and API/data operations will be covered by automated tests.
   - Explicitly list what is intentionally left for manual testing (e.g., visual UI layout, CSS styling, animations, responsive behavior).

2. **Tools & Testing Levels**:
   - Select and justify the exact testing frameworks and libraries best suited for our project's stack (e.g., Vitest/Jest, Pytest, Supertest, React Testing Library, etc.).
   - Define the test levels we will use (e.g., Unit tests for isolated logic/utilities, Integration/API tests for endpoints/services, Component tests) and specify the single terminal command to run the entire test suite.

3. **Test Organization & Test Data Isolation**:
   - Define the exact directory structure and file naming conventions for tests in this repository.
   - Explain how test data, databases, external APIs, or application state are seeded, mocked, isolated, and cleaned up between test runs so that tests remain deterministic and never interfere with each other.

After creating `docs/testing-strategy.md`, also save this exact prompt text into `docs/prompts/testing-strategy-prompt.md` so we have a record of the prompt used.
