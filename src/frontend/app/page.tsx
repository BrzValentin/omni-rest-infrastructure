import { MenuLink } from "@/components/MenuLink";
import { PublicShell } from "@/components/PublicShell";

export default function Home() {
  return (
    <PublicShell>
      <main className="homeMain" id="main-content">
        <section className="homeCard" aria-labelledby="page-title">
          <p className="eyebrow">Welcome</p>
          <h1 id="page-title">Omni REST</h1>
          <p>Discover the restaurant&apos;s current published dishes.</p>
          <MenuLink className="primaryLink">
            Browse the menu
          </MenuLink>
        </section>
      </main>
    </PublicShell>
  );
}
