import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { readAdminRestaurant } from "@/lib/admin-data";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import { encodeQr, qrToPathData } from "@/lib/qr-code";
import styles from "../../admin.module.css";

import { readQrTarget } from "./qr-target";

export const dynamic = "force-dynamic";

/**
 * The owner's QR code for the public menu (PR-26 Tasks 2 and 3).
 *
 * Deliberately a server component with no client island at all. The code is a static picture of a
 * string the server already knows, and both downloads are plain links to route handlers, so there
 * is nothing here for the browser to do — no QR library ships to the client, and the Phase 8 client
 * JavaScript budget is untouched by this page.
 *
 * The URL comes from `./qr-target`, never from this request's host. See that file for why.
 */
export default async function QrCodePage() {
  const [target, requestHeaders] = await Promise.all([readQrTarget(), headers()]);

  if (target.kind === "unauthorized") {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (target.kind === "unavailable") {
    return <AdminUnavailable reason="unavailable" section="admin.section.qrCode" />;
  }

  const restaurant = await readAdminRestaurant();

  if (target.kind === "no-address") {
    return (
      <main id="main-content" className={styles.editorMain}>
        <QrCodeHeading />
        <section className={styles.editorSection} aria-labelledby="qr-pending-title">
          <h2 id="qr-pending-title">Your web address is not set up yet</h2>
          {/* An owner cannot fix this themselves — a domain is attached by whoever set the account
              up — so this says who to ask rather than offering a control that would do nothing. */}
          <p>
            A QR code has to point at your restaurant&rsquo;s own web address, and yours has not been set
            up yet. Once it is, your code will appear here automatically. Ask whoever set up your account
            to finish adding your web address.
          </p>
        </section>
      </main>
    );
  }

  const matrix = encodeQr(target.menuUrl);

  return (
    <main id="main-content" className={styles.editorMain}>
      <QrCodeHeading />

      <section className={styles.editorSection} aria-labelledby="qr-title">
        <h2 id="qr-title">Print this code for your tables</h2>
        <p>
          Anyone who points a phone camera at this code goes straight to your menu. There is nothing to
          install and nothing to sign in to. It keeps working forever: change a price, add a dish, or
          rebuild your whole menu, and every code you have already printed still opens the current one.
        </p>

        <div className={styles.qrPanel}>
          <div className={styles.qrFrame}>
            {/* Module units and no fixed pixel size, so the same markup stays sharp at any size. The
                white rectangle covers the quiet zone as well as the code: a transparent QR printed
                onto coloured card is the classic reason a code will not scan. */}
            <svg
              role="img"
              aria-label={`QR code linking to the menu for ${restaurant?.name ?? target.host}`}
              viewBox={`0 0 ${matrix.size} ${matrix.size}`}
              shapeRendering="crispEdges"
              className={styles.qrImage}
            >
              <rect width="100%" height="100%" fill="#fff" />
              <path d={qrToPathData(matrix)} fill="#000" />
            </svg>
          </div>

          <div className={styles.qrDetail}>
            <h3>Where it goes</h3>
            {/* Shown as text as well as encoded, so an owner can check the address before committing
                it to print, and can read it out to anyone whose phone will not scan. */}
            <p className={styles.qrUrl}>{target.menuUrl}</p>
            <div className={styles.buttonRow}>
              <a className={styles.primaryLink} href="/admin/qr-code/qr.png" download>
                Download for printing (PNG)
              </a>
              <a className={styles.secondaryButton} href="/admin/qr-code/qr.svg" download>
                Download for a designer (SVG)
              </a>
            </div>
            <p>
              Use the PNG for a table tent, a sticker, or a poster you print yourself. Send the SVG to a
              professional printer or a designer &mdash; it stays sharp at any size.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.editorSection} aria-labelledby="qr-tips-title">
        <h2 id="qr-tips-title">Getting a good print</h2>
        <ul>
          <li>Print it at least 2 cm (about &frac34; inch) across for a table tent, and larger for a poster or a window.</li>
          <li>Keep the white border. It is part of the code, and trimming it off is the most common reason a code stops working.</li>
          <li>Print it dark on a light background. A code printed pale, reversed, or over a photo often will not scan.</li>
          <li>Test it with your own phone before you print a hundred of them.</li>
        </ul>
      </section>
    </main>
  );
}

function QrCodeHeading() {
  return (
    <div className={styles.editorHeading}>
      <div>
        <p className={styles.eyebrow}>Menu access</p>
        <h1>Your menu QR code</h1>
      </div>
    </div>
  );
}
