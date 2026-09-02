import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Six owner tasks, walked end to end from a cold sign-in.
 *
 * ## What this is, and what it is not
 *
 * The requirement behind this file asks for a usability study: real participants, satisfaction
 * scores, a success rate at or above 95%. None of that is reachable here, and none of it is
 * invented below — a fabricated satisfaction score is worse than an absent one, because it reads
 * like evidence. What *is* mechanically checkable about "an owner can do this unaided" is checked:
 *
 * - the task is completable using only labels that are visible on screen, with no documentation,
 *   no URL typed from memory, and no knowledge of the API underneath;
 * - it costs no more than a declared click/keystroke budget;
 * - it ends in a success confirmation the owner can actually read;
 * - it produces no console error and no failed network request along the way;
 * - and, where the public site shows the field at all, the change is visible there in the same run.
 *
 * Each task then runs again with the keyboard alone, and again at a 375px viewport.
 *
 * ## Fixture
 *
 * `owner.localhost` is a self-contained portal in `e2e/api-proxy.mjs` with state this spec alone
 * owns; it shares nothing with the `admin.localhost` fixture that `restaurant.spec.ts` and
 * `design.spec.ts` mutate. Every test resets it first, and the file runs serially because that
 * state is shared server-side.
 */

test.describe.configure({ mode: "serial" });

const ORIGIN = "http://owner.localhost:3000";
const CONTROL = "http://127.0.0.1:5290";
const OWNER_EMAIL = "owner@riverbend.test";
const OWNER_PASSWORD = "correct horse battery staple";
const ONE_BROWSER = "The portal fixture is shared server-side state, so one browser owns it.";

/** A 1x1 PNG — a valid image of the smallest possible size, so the upload is about the flow. */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/* ---------------------------------------------------------------------------
 * Effort budgets
 *
 * Counted the way the owner experiences the task: one press per click, one press per character
 * typed, plus the click that puts the cursor in a field before typing into it. Signing in is not
 * counted — every task starts from the same sign-in, and what is being measured is the task.
 *
 * Each number below is the exact cost of the shortest path through the visible interface, so a
 * budget that starts failing means a step was added, not that the number was optimistic.
 * ------------------------------------------------------------------------- */

/** Nav (1) + filter "poutine" (1+7) + price "14.75" (1+5) + Save price (1). */
const PRICE_BUDGET = 16;
/** Nav (1) + name "Bison Chili" (1+11) + price "16.00" (1+5) + Add dish (1). The category
 *  select is left at the category already shown, so it costs nothing. */
const ADD_DISH_BUDGET = 20;
/** Nav (1) + Monday opens "08:00" (1+5) + Monday closes "16:00" (1+5) + Save regular hours (1). */
const REGULAR_HOURS_BUDGET = 14;
/** Nav (1) + Edit (1) + note "Holiday brunch" (1+14) + opens "11:00" (1+5) + Save (1). */
const SPECIAL_HOURS_BUDGET = 24;
/** Nav (1) + choose a file (1) + alt text "Dining room" (1+11) + Upload photo (1). */
const PHOTO_BUDGET = 15;
/** Nav (1) + "+12045550188" (1+12) + "(204) 555-0188" (1+14) + "hello@riverbend.test" (1+20)
 *  + "https://riverbend.test" (1+22) + Save profile (1). Dominated by typing four values the
 *  owner has to enter in full; there is no shorter honest path. */
const CONTACT_BUDGET = 74;

/* ------------------------------------------------------------------------- */

/** Counts what a task costs, so a budget can be asserted rather than asserted about. */
class Effort {
  private presses = 0;

  spend(count: number): void {
    this.presses += count;
  }

  get total(): number {
    return this.presses;
  }
}

async function click(effort: Effort, target: Locator): Promise<void> {
  effort.spend(1);
  await target.click();
}

/** One click to place the cursor, then one press per character. */
async function typeInto(effort: Effort, target: Locator, value: string): Promise<void> {
  effort.spend(1 + value.length);
  await target.fill(value);
}

/**
 * Everything the browser objected to during one walkthrough.
 *
 * `/favicon.ico` and `/.well-known/…` are excluded: Chromium asks for both on its own initiative,
 * this application ships neither, and neither is anything the owner did.
 */
type Observed = Readonly<{ consoleErrors: string[]; failedRequests: string[]; dialogs: string[] }>;

function observe(page: Page): Observed {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const dialogs: string[] = [];
  const selfInflicted = (url: string) => /\/favicon\.ico$|\/\.well-known\//.test(url);

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`uncaught: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (!selfInflicted(request.url())) failedRequests.push(`failed ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !selfInflicted(response.url())) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });
  // The four editors guard navigation away from unsaved edits with a confirm dialog. Every
  // walkthrough saves before it moves, so this must stay silent; dismissing rather than accepting
  // keeps a stray prompt loud instead of letting it pass unnoticed.
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  return { consoleErrors, failedRequests, dialogs };
}

function expectQuietRun(observed: Observed): void {
  expect(observed.consoleErrors, "the walkthrough must produce no console error").toEqual([]);
  expect(observed.failedRequests, "the walkthrough must produce no failed request").toEqual([]);
  expect(observed.dialogs, "no unsaved-changes prompt should appear after a save").toEqual([]);
}

async function resetPortal(page: Page): Promise<void> {
  const response = await page.request.post(`${CONTROL}/__e2e/owner-reset?host=owner.localhost`);
  expect(response.ok(), "could not reset the owner fixture").toBe(true);
}

/** A cold sign-in that lands on the dashboard, from which every task is reached by visible links. */
async function signIn(page: Page): Promise<void> {
  await page.goto(`${ORIGIN}/admin`);
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(`${ORIGIN}/admin`);
  await expect(page.getByRole("heading", { name: "Riverbend Diner", level: 1 })).toBeVisible();
}

/**
 * Asserts the portal describes publishing in the owner's words, and never in the system's.
 *
 * The status a save reports is genuinely nondeterministic: the outbox worker can claim the row
 * before the inline dispatch reports on it, so the same successful save comes back `succeeded` on
 * one run and `processing` on the next. Asserting one exact immediate status is therefore a flake
 * waiting to happen. This asserts the vocabulary; {@link expectPublicationSettles} polls for the
 * settled outcome on the one page that exposes it.
 */
async function expectPlainPublicationWording(page: Page): Promise<void> {
  const statusBar = page.locator('[role="status"]').first();
  await expect(statusBar).toContainText(
    /Website up to date|Website updating now|Website update did not finish|Not published yet/,
  );
  const wording = (await statusBar.innerText()).toLowerCase();
  for (const internal of ["succeeded", "processing", "pending", "outbox", "draftversion"]) {
    expect(wording, `the owner is never shown the internal state "${internal}"`).not.toContain(internal);
  }
}

/** Polls the restaurant page's publication panel until the website has settled. */
async function expectPublicationSettles(page: Page): Promise<void> {
  const panel = page.locator('section[aria-labelledby="publication-title"]');
  await expect(panel.getByRole("status")).toHaveText("Website up to date", { timeout: 30_000 });
}

/* ---------------------------------------------------------------------------
 * The six walkthroughs
 * ------------------------------------------------------------------------- */

type Walkthrough = Readonly<{
  name: string;
  budget: number;
  /** Drives the task through the visible interface and asserts its success confirmation. */
  run: (page: Page, effort: Effort) => Promise<void>;
  /** Confirms the change on the public site, for the fields the public site shows. */
  reachesPublicSite: ((page: Page) => Promise<void>) | null;
}>;

async function openDishes(page: Page, effort: Effort): Promise<void> {
  await click(effort, page.getByRole("link", { name: "My Dishes", exact: true }));
  await expect(page.getByRole("heading", { name: "Dishes", level: 1 })).toBeVisible();
}

async function openRestaurant(page: Page, effort: Effort): Promise<void> {
  await click(effort, page.getByRole("link", { name: "My Restaurant", exact: true }));
  await expect(page.getByRole("heading", { name: "Restaurant", level: 1 })).toBeVisible();
}

const walkthroughs: readonly Walkthrough[] = [
  {
    name: "change a dish price",
    budget: PRICE_BUDGET,
    run: async (page, effort) => {
      await openDishes(page, effort);

      // The filter narrows the list by name, which is how an owner with a long menu finds one
      // dish. It is a pass over the menu already in hand, so nothing else on the page changes.
      await typeInto(effort, page.getByLabel("Search dishes by name"), "poutine");
      await expect(page.getByText(/1 of 2 dishes match/)).toBeVisible();
      await expect(page.getByLabel("Price for Saskatoon Berry Tart", { exact: true })).toHaveCount(0);

      await typeInto(effort, page.getByLabel("Price for Prairie Poutine", { exact: true }), "14.75");
      await click(effort, page.getByRole("button", { name: "Save price for Prairie Poutine" }));

      await expect(page.getByText("Prairie Poutine is now $14.75.")).toBeVisible();
      await expectPlainPublicationWording(page);
    },
    reachesPublicSite: async (page) => {
      await page.goto(`${ORIGIN}/menu`);
      await expect(page.getByRole("heading", { level: 3, name: "Prairie Poutine" })).toBeVisible();
      await expect(page.getByText("$14.75")).toBeVisible();
    },
  },
  {
    name: "add a menu item",
    budget: ADD_DISH_BUDGET,
    run: async (page, effort) => {
      await openDishes(page, effort);

      const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add a dish" }) });
      await typeInto(effort, form.getByLabel("Name"), "Bison Chili");
      await typeInto(effort, form.getByLabel(/^Price \(/), "16.00");
      await click(effort, form.getByRole("button", { name: "Add dish" }));

      await expect(page.getByText(/Dish saved\./)).toBeVisible();
      await expect(page.getByLabel("Price for Bison Chili", { exact: true })).toBeVisible();
      await expectPlainPublicationWording(page);
    },
    reachesPublicSite: async (page) => {
      await page.goto(`${ORIGIN}/menu`);
      await expect(page.getByRole("heading", { level: 3, name: "Bison Chili" })).toBeVisible();
      await expect(page.getByText("$16.00")).toBeVisible();
    },
  },
  {
    name: "edit regular hours",
    budget: REGULAR_HOURS_BUDGET,
    run: async (page, effort) => {
      await openRestaurant(page, effort);

      const monday = page.getByRole("group", { name: "Monday" });
      await typeInto(effort, monday.getByLabel("Opens").first(), "08:00");
      await typeInto(effort, monday.getByLabel("Closes").first(), "16:00");
      await click(effort, page.getByRole("button", { name: "Save regular hours" }));

      await expect(page.getByText(/Regular hours saved\./)).toBeVisible();
      await expectPlainPublicationWording(page);
      await expectPublicationSettles(page);
    },
    reachesPublicSite: async (page) => {
      await page.goto(`${ORIGIN}/`);
      await expect(page.getByText(/08:00–16:00/).first()).toBeVisible();
    },
  },
  {
    name: "edit special hours",
    budget: SPECIAL_HOURS_BUDGET,
    run: async (page, effort) => {
      await openRestaurant(page, effort);

      const special = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Special hours" }) });
      await click(effort, special.getByRole("button", { name: "Edit", exact: true }));
      await expect(special.getByLabel("Date")).toHaveValue("2026-12-25");

      await typeInto(effort, special.getByLabel("Note"), "Holiday brunch");
      await typeInto(effort, special.getByLabel("Opens").first(), "11:00");
      await click(effort, special.getByRole("button", { name: "Save special date" }));

      await expect(page.getByText(/Special hours saved\./)).toBeVisible();
      await expectPlainPublicationWording(page);
      await expectPublicationSettles(page);
    },
    reachesPublicSite: async (page) => {
      await page.goto(`${ORIGIN}/`);
      await expect(page.getByText(/2026-12-25.*11:00–14:00.*Holiday brunch/).first()).toBeVisible();
    },
  },
  {
    name: "upload a photo",
    budget: PHOTO_BUDGET,
    run: async (page, effort) => {
      await click(effort, page.getByRole("link", { name: "My Gallery", exact: true }));
      await expect(page.getByRole("heading", { name: "Photo gallery", level: 1 })).toBeVisible();
      // The drop zone is a shortcut over the file picker, never a replacement for it, so the
      // picker is what a walkthrough drives — it is the path that works for everyone.
      await expect(page.getByRole("group", { name: "Photo upload area" })).toBeVisible();

      // Choosing a file in the operating system's picker is one press for the owner; Playwright
      // sets the input directly because the picker is not part of this page.
      effort.spend(1);
      await page.getByLabel("Photo file").setInputFiles({
        name: "dining-room.png", mimeType: "image/png", buffer: PHOTO,
      });
      await expect(page.getByText("Ready to upload: dining-room.png")).toBeVisible();

      await typeInto(effort, page.getByLabel("Alt text", { exact: true }), "Dining room");
      await click(effort, page.getByRole("button", { name: "Upload photo" }));

      await expect(page.getByText(/Photo saved\./)).toBeVisible();
      await expect(page.getByRole("listitem", { name: /Dining room, position 2 of 2/ })).toBeVisible();
      // Every entry keeps a Replace control, so swapping the picture never costs the alt text,
      // the caption, or the position.
      await expect(page.getByLabel("Replace Dining room")).toHaveCount(1);
      await expectPlainPublicationWording(page);
    },
    // The published gallery renders through the Next.js image optimizer, which a run that counts
    // failed network requests should not be measuring; the fixture therefore publishes an empty
    // gallery and the photo is confirmed in the editor above.
    reachesPublicSite: null,
  },
  {
    name: "change contact information",
    budget: CONTACT_BUDGET,
    run: async (page, effort) => {
      await openRestaurant(page, effort);

      await typeInto(effort, page.getByLabel("Phone number (with country code)"), "+12045550188");
      await typeInto(effort, page.getByLabel("Phone number as shown to visitors"), "(204) 555-0188");
      await typeInto(effort, page.getByLabel("Email"), "hello@riverbend.test");
      await typeInto(effort, page.getByLabel("Website"), "https://riverbend.test");
      await click(effort, page.getByRole("button", { name: "Save profile" }));

      await expect(page.getByText(/Profile saved\./)).toBeVisible();
      await expectPlainPublicationWording(page);
      await expectPublicationSettles(page);
    },
    reachesPublicSite: async (page) => {
      await page.goto(`${ORIGIN}/`);
      await expect(page.getByRole("link", { name: "Call (204) 555-0188" }))
        .toHaveAttribute("href", "tel:+12045550188");
      await expect(page.getByRole("link", { name: "hello@riverbend.test" }))
        .toHaveAttribute("href", "mailto:hello@riverbend.test");

      // The public design does not surface the website field, so it is confirmed where it was
      // entered — a reload proves it was stored rather than merely echoed into the form.
      await page.goto(`${ORIGIN}/admin/restaurant`);
      await expect(page.getByLabel("Website")).toHaveValue("https://riverbend.test");
    },
  },
];

for (const walkthrough of walkthroughs) {
  test(`an owner can ${walkthrough.name} unaided from a cold sign-in`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
    test.setTimeout(120_000);

    await resetPortal(page);
    const observed = observe(page);
    await signIn(page);

    const effort = new Effort();
    await walkthrough.run(page, effort);
    expect(
      effort.total,
      `"${walkthrough.name}" cost ${effort.total} presses against a budget of ${walkthrough.budget}`,
    ).toBeLessThanOrEqual(walkthrough.budget);

    await walkthrough.reachesPublicSite?.(page);
    expectQuietRun(observed);
  });
}

/* ---------------------------------------------------------------------------
 * Keyboard-only pass
 * ------------------------------------------------------------------------- */

/**
 * Moves focus to `target` using nothing but the Tab key, and reports how many presses it took.
 *
 * This searches rather than counting to a fixed position on purpose: what matters is that the
 * control is reachable from the keyboard at all, and a spec that hard-codes tab counts breaks the
 * moment a field is added above it. Each task below runs in document order, and each page is
 * entered fresh, so the search only ever moves forward.
 */
async function tabTo(page: Page, target: Locator, label: string, maxPresses = 150): Promise<void> {
  for (let pressed = 0; pressed < maxPresses; pressed += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`"${label}" was not reachable within ${maxPresses} Tab presses.`);
}

async function keyType(page: Page, target: Locator, label: string, value: string): Promise<void> {
  await tabTo(page, target, label);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(value);
}

async function keyActivate(page: Page, target: Locator, label: string): Promise<void> {
  await tabTo(page, target, label);
  await page.keyboard.press("Enter");
}

test("every task can be completed with the keyboard alone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
  test.setTimeout(180_000);

  await resetPortal(page);
  const observed = observe(page);
  await signIn(page);

  // The tasks are taken in the order the controls appear on each page, and each page is entered
  // freshly, so focus only ever needs to move forward. Reloading between pages is the browser's
  // own control (F5), not a pointer.
  await keyActivate(page, page.getByRole("link", { name: "My Restaurant", exact: true }), "My Restaurant");
  await expect(page.getByRole("heading", { name: "Restaurant", level: 1 })).toBeVisible();

  // 6. change contact information
  await keyType(page, page.getByLabel("Phone number (with country code)"), "phone", "+12045550188");
  await keyType(page, page.getByLabel("Phone number as shown to visitors"), "shown phone", "(204) 555-0188");
  await keyType(page, page.getByLabel("Email"), "email", "hello@riverbend.test");
  await keyType(page, page.getByLabel("Website"), "website", "https://riverbend.test");
  await keyActivate(page, page.getByRole("button", { name: "Save profile" }), "Save profile");
  await expect(page.getByText(/Profile saved\./)).toBeVisible();

  // 3. edit regular hours. The opening times are `<input type="time">`, whose segmented keyboard
  // behaviour is the browser's and locale's rather than this application's, so the keyboard pass
  // drives the buttons the editor supplies instead: Sunday gains a period and the day opens.
  const sunday = page.getByRole("group", { name: "Sunday" });
  await keyActivate(page, sunday.getByRole("button", { name: "Add period" }), "Sunday add period");
  await keyActivate(page, page.getByRole("button", { name: "Save regular hours" }), "Save regular hours");
  await expect(page.getByText(/Regular hours saved\./)).toBeVisible();

  // 4. edit special hours
  const special = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Special hours" }) });
  await keyActivate(page, special.getByRole("button", { name: "Edit", exact: true }), "Edit special hours");
  await keyType(page, special.getByLabel("Note"), "note", "Holiday brunch");
  await keyActivate(page, special.getByRole("button", { name: "Save special date" }), "Save special date");
  await expect(page.getByText(/Special hours saved\./)).toBeVisible();

  await page.reload();
  await keyActivate(page, page.getByRole("link", { name: "My Dishes", exact: true }), "My Dishes");
  await expect(page.getByRole("heading", { name: "Dishes", level: 1 })).toBeVisible();

  // 1. change a dish price
  await keyType(page, page.getByLabel("Search dishes by name"), "dish filter", "poutine");
  await keyType(page, page.getByLabel("Price for Prairie Poutine", { exact: true }), "poutine price", "14.75");
  await keyActivate(page, page.getByRole("button", { name: "Save price for Prairie Poutine" }), "Save price");
  await expect(page.getByText("Prairie Poutine is now $14.75.")).toBeVisible();

  // 2. add a menu item, using the form below the list the filter is still narrowing.
  const dishForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add a dish" }) });
  await keyType(page, dishForm.getByLabel("Name"), "dish name", "Bison Chili");
  await keyType(page, dishForm.getByLabel(/^Price \(/), "dish price", "16.00");
  await keyActivate(page, dishForm.getByRole("button", { name: "Add dish" }), "Add dish");
  await expect(page.getByText(/Dish saved\./)).toBeVisible();

  await page.reload();
  await keyActivate(page, page.getByRole("link", { name: "My Gallery", exact: true }), "My Gallery");
  await expect(page.getByRole("heading", { name: "Photo gallery", level: 1 })).toBeVisible();

  // 5. upload a photo. The file picker is the operating system's, not this page's; what the page
  // owes the keyboard is a reachable, focusable input, which is what is asserted here.
  const picker = page.getByLabel("Photo file");
  await tabTo(page, picker, "Photo file");
  await picker.setInputFiles({ name: "dining-room.png", mimeType: "image/png", buffer: PHOTO });
  await keyType(page, page.getByLabel("Alt text", { exact: true }), "alt text", "Dining room");
  await keyActivate(page, page.getByRole("button", { name: "Upload photo" }), "Upload photo");
  await expect(page.getByText(/Photo saved\./)).toBeVisible();

  expectQuietRun(observed);
});

/* ---------------------------------------------------------------------------
 * 375px pass
 * ------------------------------------------------------------------------- */

test("every task can be completed at a 375px viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 375, height: 812 });
  await resetPortal(page);
  const observed = observe(page);
  await signIn(page);

  for (const walkthrough of walkthroughs) {
    const effort = new Effort();
    await walkthrough.run(page, effort);
    expect(
      effort.total,
      `"${walkthrough.name}" cost ${effort.total} presses at 375px against a budget of ${walkthrough.budget}`,
    ).toBeLessThanOrEqual(walkthrough.budget);

    // A phone-width owner must never have to scroll sideways to finish a task.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `"${walkthrough.name}" pushed the page sideways at 375px`).toBeLessThanOrEqual(1);

    // Each task starts from a freshly loaded editor. Without this the next task inherits the
    // previous one's client state — the dish filter, most obviously, which would then hide the
    // row the next task is looking for.
    await page.reload();
  }

  expectQuietRun(observed);
});
