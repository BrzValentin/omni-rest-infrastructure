import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

/**
 * PR-26, QR code menu access, end to end.
 *
 * ## The defect this file exists to make unlandable
 *
 * A QR code gets printed. Once it is on three hundred table tents nobody can correct it, so the one
 * thing this feature must never get wrong is **which host it encodes**.
 *
 * The owner portal is not served on the restaurant's public host. The fixtures make that concrete:
 * the owner signs in on `qr.localhost`, while the tenant's public address is `menu.localhost`. Any
 * code that derived the QR target from the *request* origin — `siteOrigin()`, the `Host` header, the
 * page's own URL — would encode the admin origin, and every printed code would open a login page.
 * Nothing about the rendered picture would look wrong. The page would still be beautiful; the
 * restaurant would still reprint at its own expense.
 *
 * So the load-bearing test below is the boring one: the URL the page displays starts with the
 * tenant's public origin and does not contain the admin host anywhere. Everything else here —
 * the downloads, the accessibility pass, the empty state — is worth having, but that assertion is
 * why the file exists, and it is the one to keep working if the rest is ever rewritten.
 *
 * ## Fixture
 *
 * Three tenants in `e2e/api-proxy.mjs`, each on its own admin host with its own seeded owner and its
 * own read-only public address. They share no state with `admin.localhost` — which `restaurant.spec`
 * and `design.spec` already collide on — and no state with each other.
 *
 * ## Why the picture is asserted through its text
 *
 * `app/admin/(protected)/qr-code/page.tsx` encodes `target.menuUrl` and prints the same value below
 * the image in the same render. There is no second source and no client code between them, so the
 * displayed text is the encoded string. Asserting it is asserting the code, without shipping a QR
 * decoder into the test suite — and the scan test further down proves the string actually resolves.
 */

test.describe.configure({ mode: "serial" });

const LOOPBACK = "http://127.0.0.1:3000";
const ONE_BROWSER = "The code is server-rendered from backend data; five browsers would only multiply sign-ins.";

/** The fixture accepts any credentials on these hosts; what is under test is never the password. */
const OWNER_EMAIL = "owner@qr-fixture.test";
const OWNER_PASSWORD = "correct horse battery staple";

type Tenant = Readonly<{
  /** Where the owner signs in. Never where the menu lives. */
  origin: string;
  /** The public origin the printed code must name, port included. */
  publicOrigin: string | null;
  /** The bare hostname, for the substring assertions that carry the leakage claim. */
  publicHost: string | null;
  restaurantName: string;
}>;

/* `satisfies` rather than an annotation: the two addressed tenants keep their non-null host types, so
 * the substring assertions below need no narrowing to say what they mean. */
const PRIMARY = {
  origin: "http://qr.localhost:3000",
  publicOrigin: "http://menu.localhost:3000",
  publicHost: "menu.localhost",
  restaurantName: "Corner Cafe",
} satisfies Tenant;

const SECOND = {
  origin: "http://qr-second.localhost:3000",
  publicOrigin: "http://bistro.localhost:3000",
  publicHost: "bistro.localhost",
  restaurantName: "Bistro Bijou",
} satisfies Tenant;

const UNADDRESSED = {
  origin: "http://qr-unaddressed.localhost:3000",
  publicOrigin: null,
  publicHost: null,
  restaurantName: "Unlisted Kitchen",
} satisfies Tenant;

type SessionState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * One signed-in session per tenant, captured once and replayed into every later context.
 *
 * Two reasons, and the first is not an optimisation. The sign-in form is a client component, so the
 * JavaScript-disabled context below could never complete it — replaying a captured session is the
 * only way that test can be a signed-in owner at all. The second is thrift: the suite as a whole has
 * a ceiling of 20 sign-ins per account per minute (`e2e/start-backend.mjs`), and this file spends
 * three in total no matter how many tests are added below.
 *
 * The cache is also why `mode: "serial"` above is declared: it is per-worker state, and tests running
 * in parallel would each sign in again rather than share it.
 */
const sessions = new Map<string, SessionState>();

async function signInOnce(browser: Browser, tenant: Tenant): Promise<SessionState> {
  const cached = sessions.get(tenant.origin);
  if (cached) return cached;

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // Absolute, always. A relative `/admin` would resolve against the project baseURL and land on the
    // public host, where this fixture's owner does not exist — the trap `e2e/design.spec.ts` records.
    await page.goto(`${tenant.origin}/admin`);
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: tenant.restaurantName, level: 1 })).toBeVisible();

    const state = await context.storageState();
    sessions.set(tenant.origin, state);
    return state;
  } finally {
    await context.close();
  }
}

/** A browser context already holding this tenant's owner session. */
async function ownerContext(
  browser: Browser,
  tenant: Tenant,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  return browser.newContext({ ...options, storageState: await signInOnce(browser, tenant) });
}

/** The session cookies as one header, for the raw `request.*` calls that carry no cookie jar. */
async function ownerCookieHeader(browser: Browser, tenant: Tenant): Promise<string> {
  const { cookies } = await signInOnce(browser, tenant);
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

/**
 * Dials the frontend the way a reverse proxy does: the loopback address, with the tenant named in
 * `Host`. Browsers resolve `*.localhost` themselves but Node's resolver does not, so `request.*`
 * cannot address a tenant hostname directly — the same constraint `e2e/seo.spec.ts` documents.
 */
function asTenant(origin: string, cookie?: string): { headers: Record<string, string> } {
  const { host } = new URL(origin);
  return { headers: cookie === undefined ? { host } : { host, cookie } };
}

/**
 * The menu URL as the owner reads it on the page.
 *
 * Matched by its text, not by `styles.qrUrl` — CSS Modules hashes that into something like
 * `admin_qrUrl__1a2b3`, and the class is an implementation detail while the address being *legible*
 * is the point: an owner has to be able to check it before committing it to print, and read it aloud
 * to anyone whose phone will not scan. Playwright's strict mode turns a second matching element into
 * a loud failure rather than a silent `.first()`.
 */
function menuUrlText(page: Page) {
  return page.getByText(/^https?:\/\/\S+\/menu$/);
}

async function readMenuUrl(page: Page): Promise<string> {
  return (await menuUrlText(page).innerText()).trim();
}

/** Opens the QR page for a tenant and returns the URL it displays. */
async function shownMenuUrl(browser: Browser, tenant: Tenant): Promise<string> {
  const context = await ownerContext(browser, tenant);
  try {
    const page = await context.newPage();
    await page.goto(`${tenant.origin}/admin/qr-code`);
    return await readMenuUrl(page);
  } finally {
    await context.close();
  }
}

/**
 * Follows an encoded URL the way a phone camera does: a fresh cookieless client, one request, and no
 * redirect allowed. Playwright reports an exceeded redirect budget as a thrown error rather than as a
 * `3xx` response, so a redirect is turned back into something a failure message can print.
 */
async function scan(request: APIRequestContext, menuUrl: string) {
  const target = new URL(menuUrl);
  try {
    const response = await request.get(`${LOOPBACK}${target.pathname}`, {
      headers: { host: target.host },
      maxRedirects: 0,
    });
    return { outcome: response.status() as number | string, response };
  } catch (error) {
    return { outcome: `a redirect (${(error as Error).message})`, response: null };
  }
}

/* ------------------------------------------------------------------------- */

test("encodes the restaurant's own public host and never the admin host the portal is served on", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  const context = await ownerContext(browser, PRIMARY);
  const page = await context.newPage();
  await page.goto(`${PRIMARY.origin}/admin/qr-code`);

  await expect(page.getByRole("heading", { level: 1, name: "Your menu QR code" })).toBeVisible();
  await expect(page.getByRole("img", { name: `QR code linking to the menu for ${PRIMARY.restaurantName}` })).toBeVisible();
  await expect(menuUrlText(page), "the page must show exactly one address, and show it as text").toHaveCount(1);

  const menuUrl = await readMenuUrl(page);

  /* ---------------------------------------------------------------------------
   * This is the assertion the file is for.
   *
   * The owner signed in on `qr.localhost`. The code must name `menu.localhost`, because that is what
   * the backend reports from `restaurant_domains` and the tenant slug — not what this request's host
   * happens to be. If a refactor ever swaps the backend read for the request origin, the URL becomes
   * `http://qr.localhost:3000/menu`, every printed code opens a login page, and only this fails.
   * ------------------------------------------------------------------------- */
  expect(menuUrl, "the printed code must point at the tenant's public menu").toBe(`${PRIMARY.publicOrigin}/menu`);
  expect(
    menuUrl.startsWith(`${PRIMARY.publicOrigin}/`),
    "the encoded URL must begin at the tenant's public origin",
  ).toBe(true);
  expect(
    menuUrl,
    "the admin host must never appear in a code a restaurant prints: it would send every scan to a login page",
  ).not.toContain("qr.localhost");

  // The reassurance the page makes to the owner, in the owner's words.
  await expect(page.getByRole("heading", { level: 2, name: "Print this code for your tables" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download for printing (PNG)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download for a designer (SVG)" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);

  await context.close();
});

test("renders the code and its URL in the server HTML, with no client JavaScript", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  // The session comes from the cached sign-in: the login form is a client component, so a context
  // with JavaScript disabled could not complete it, and replaying the cookie is the only honest way
  // to be a signed-in owner here. Everything the page then does must survive without a script.
  const context = await ownerContext(browser, PRIMARY, {
    javaScriptEnabled: false,
    viewport: { width: 768, height: 1_024 },
  });
  const page = await context.newPage();
  await page.goto(`${PRIMARY.origin}/admin/qr-code`);

  await expect(page.getByRole("heading", { level: 1, name: "Your menu QR code" })).toBeVisible();
  await expect(page.getByRole("img", { name: `QR code linking to the menu for ${PRIMARY.restaurantName}` })).toBeVisible();
  expect(await readMenuUrl(page), "the URL must be in the server HTML, not painted in later").toBe(
    `${PRIMARY.publicOrigin}/menu`,
  );
  // Both downloads are plain links to route handlers, so they work here too.
  await expect(page.getByRole("link", { name: "Download for printing (PNG)" })).toHaveAttribute(
    "href",
    "/admin/qr-code/qr.png",
  );
  await expect(page.getByRole("link", { name: "Download for a designer (SVG)" })).toHaveAttribute(
    "href",
    "/admin/qr-code/qr.svg",
  );

  await context.close();
});

test("opens the menu directly when the encoded URL is scanned, with no redirect and no sign-in", async ({ browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  const menuUrl = await shownMenuUrl(browser, PRIMARY);
  expect(menuUrl, "nothing below can be trusted if the page showed no URL").toBe(`${PRIMARY.publicOrigin}/menu`);

  // `request` is Playwright's own context: it holds none of the cookies any browser context above
  // collected, which is exactly the state a stranger's phone is in.
  const { outcome, response } = await scan(request, menuUrl);
  expect(
    outcome,
    `scanning ${menuUrl} must reach the menu in one request. A printed code cannot be re-pointed, so a `
    + "redirect here is a dependency on a hop that must then keep working forever, and a sign-in here "
    + "is a code that never worked at all",
  ).toBe(200);
  if (!response) throw new Error("unreachable: the assertion above already failed");

  expect(response.headers()["content-type"]).toContain("text/html");
  const body = await response.text();
  // The menu itself, not a shell that would fetch it: this response is the whole promise of the code.
  expect(body, "the scan must land on the published menu").toContain("Prairie Poutine");
  expect(body, "the scan must not land on the owner portal").not.toContain("Owner Portal");
});

test("serves both downloads as real, correctly named image files", async ({ browser, page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  const cookie = await ownerCookieHeader(browser, PRIMARY);

  const svg = await request.get(`${LOOPBACK}/admin/qr-code/qr.svg`, asTenant(PRIMARY.origin, cookie));
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect(
    svg.headers()["content-disposition"],
    "the file lands in a designer's folder weeks later and has to say what it is",
  ).toBe('attachment; filename="corner-cafe-menu-qr.svg"');

  // Parsed rather than pattern-matched: what a designer's tool will do with this file is parse it as
  // XML, and a markup fault that a substring check waves through would fail there instead of here.
  const markup = await svg.text();
  const parsed = await page.evaluate((source) => {
    const document_ = new DOMParser().parseFromString(source, "image/svg+xml");
    return {
      rootTag: document_.documentElement.tagName,
      malformed: document_.querySelector("parsererror") !== null,
      pathLength: document_.querySelector("path")?.getAttribute("d")?.length ?? 0,
    };
  }, markup);
  expect(parsed.malformed, "the downloaded SVG must be well-formed XML").toBe(false);
  expect(parsed.rootTag).toBe("svg");
  expect(parsed.pathLength, "an SVG whose <path> is empty is a blank square, not a QR code").toBeGreaterThan(0);

  const png = await request.get(`${LOOPBACK}/admin/qr-code/qr.png`, asTenant(PRIMARY.origin, cookie));
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toContain("image/png");
  expect(png.headers()["content-disposition"]).toBe('attachment; filename="corner-cafe-menu-qr.png"');

  // The eight-byte PNG signature. An owner's printer decides what this file is by reading it, not by
  // trusting the extension, so the bytes have to be a PNG and not merely be called one.
  const bytes = await png.body();
  expect([...bytes.subarray(0, 8)], "the PNG download must begin with the PNG signature").toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
});

test("gives two restaurants two different codes, each naming only its own host", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  const first = await shownMenuUrl(browser, PRIMARY);
  const second = await shownMenuUrl(browser, SECOND);

  expect(first, "two restaurants must never be handed the same code").not.toBe(second);
  expect(first).toBe(`${PRIMARY.publicOrigin}/menu`);
  expect(second).toBe(`${SECOND.publicOrigin}/menu`);

  // Stated as containment as well as equality: this is the leakage claim (PR-26 Task 6), and a code
  // that carried the neighbouring restaurant's host would send one restaurant's diners to the other.
  expect(first).toContain(PRIMARY.publicHost);
  expect(first, "one tenant's code must not name another tenant's host").not.toContain(SECOND.publicHost);
  expect(second).toContain(SECOND.publicHost);
  expect(second, "one tenant's code must not name another tenant's host").not.toContain(PRIMARY.publicHost);
});

test("refuses to hand a QR code to a caller who is not signed in", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  for (const path of ["/admin/qr-code/qr.svg", "/admin/qr-code/qr.png"]) {
    // No cookie: the route handlers do not run the protected layout, so this is the only check
    // standing between a stranger and the tenant's address.
    const response = await request.get(`${LOOPBACK}${path}`, asTenant(PRIMARY.origin));

    expect(response.status(), `${path} must refuse an anonymous caller`).toBe(401);
    expect(response.headers()["content-type"] ?? "").not.toContain("image/");
    const body = await response.text();
    expect(body, `${path} must not return an image to an anonymous caller`).not.toContain("<svg");
    expect(body, `${path} must not leak the tenant's public host`).not.toContain(PRIMARY.publicHost);
  }
});

test("explains itself instead of printing a broken code when the restaurant has no web address", async ({ browser, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  const context = await ownerContext(browser, UNADDRESSED);
  const page = await context.newPage();
  await page.goto(`${UNADDRESSED.origin}/admin/qr-code`);

  await expect(page.getByRole("heading", { level: 1, name: "Your menu QR code" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Your web address is not set up yet" })).toBeVisible();
  // The owner cannot fix this themselves, so the copy has to say who can.
  await expect(page.getByText(/Ask whoever set up your account to finish adding your web address/)).toBeVisible();

  // No picture and no downloads: a code encoding nothing is worse than no code, because it looks fine.
  await expect(page.getByRole("main").getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download for printing (PNG)" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download for a designer (SVG)" })).toHaveCount(0);

  const cookie = await ownerCookieHeader(browser, UNADDRESSED);
  for (const path of ["/admin/qr-code/qr.svg", "/admin/qr-code/qr.png"]) {
    const response = await request.get(`${LOOPBACK}${path}`, asTenant(UNADDRESSED.origin, cookie));
    expect(response.status(), `${path} must have nothing to download either`).toBe(404);
    expect(await response.text()).not.toContain("<svg");
  }

  await context.close();
});
