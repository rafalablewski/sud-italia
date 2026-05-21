import Link from "next/link";
import { Bi } from "./Bi";
import { getLoyaltySettings } from "@/lib/store";

export async function SociSection() {
  const loyalty = await getLoyaltySettings();
  const activeRewards = loyalty.rewards
    .filter((r) => r.active)
    .sort((a, b) => a.pointsCost - b.pointsCost);
  const firstReward = activeRewards[0];
  const goldThreshold = loyalty.tiers.gold.threshold;

  return (
    <section id="soci" className="v8-section v8-dark v8-soci">
      <div className="v8-inner">
        <div className="v8-eyebrow">
          <Bi en="Members & friends" pl="Klub i przyjaciele" /> ·{" "}
          <span className="v8-it">soci e amici</span>
        </div>

        <h2 className="v8-title">
          <Bi en="A pizza," pl="Pizza," /> <span className="v8-it">una storia</span>
        </h2>

        <p className="v8-sub">
          <Bi en="Earn" pl="Zdobądź" />{" "}
          <span className="v8-soci-points">
            1 <Bi en="point" pl="punkt" />
          </span>{" "}
          <Bi
            en="for each złoty spent. No app to install — your phone number remembers you."
            pl="za każdą wydaną złotówkę. Bez instalowania aplikacji — Twój numer telefonu Cię pamięta."
          />{" "}
          <span className="v8-soci-em">Famiglia Oro</span>{" "}
          <Bi en="at" pl="po" />{" "}
          <span className="v8-soci-points v8-num">{goldThreshold}</span>{" "}
          <Bi en="points unlocks an" pl="punktach odblokowuje" />{" "}
          <span className="v8-soci-em">antipasto della casa</span>{" "}
          <Bi en="on every visit." pl="przy każdej wizycie." />
          {firstReward && (
            <>
              {" "}
              <Bi en="First reward" pl="Pierwsza nagroda" />{" "}
              (<span className="v8-soci-em">{firstReward.name}</span>){" "}
              <Bi en="from" pl="już od" />{" "}
              <span className="v8-soci-points v8-num">{firstReward.pointsCost}</span>{" "}
              <Bi en="points." pl="punktów." />
            </>
          )}
        </p>

        <div className="v8-soci-cta-wrap">
          <Link href="/rewards" className="v8-cta">
            <Bi en="Start earning points" pl="Zacznij zdobywać punkty" />{" "}
            <span className="v8-it v8-cta-it">· inizia a guadagnare</span>{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
