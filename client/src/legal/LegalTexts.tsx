import type { ReactNode } from 'react';
import { TERMS_DATE } from '../../../shared/legal.ts';
import { isPlaceholder, OPERATOR } from './operator.ts';

/*
 * The legal texts of phonegames: imprint, terms of use (AGB) and privacy notice. Drafts written for
 * this app – they describe what it really does (see docs/ARCHITEKTUR.md, «Datenschutz») and should be
 * checked by a lawyer. Used on the public pages /impressum, /agb, /datenschutz and in the sheets of
 * the registration and the consent page.
 */

/** A value of OPERATOR – highlighted while it is still a placeholder. */
function Value({ children }: { children: string }) {
  return isPlaceholder(children) ? <mark className="legal__todo">{children}</mark> : <>{children}</>;
}

function Operator() {
  return (
    <>
      <Value>{OPERATOR.name}</Value>
      <br />
      <Value>{OPERATOR.street}</Value>
      <br />
      <Value>{OPERATOR.city}</Value>
      <br />
      {OPERATOR.country}
    </>
  );
}

function Email() {
  return isPlaceholder(OPERATOR.email) ? <Value>{OPERATOR.email}</Value> : <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ImprintText() {
  return (
    <div className="legal">
      <Section title="Betreiber">
        <p>
          <Operator />
        </p>
        {OPERATOR.uid && <p>UID: {OPERATOR.uid}</p>}
      </Section>
      <Section title="Kontakt">
        <p>
          E-Mail: <Email />
        </p>
      </Section>
      <Section title="Verantwortlich für den Inhalt">
        <p>
          <Value>{OPERATOR.name}</Value>
        </p>
      </Section>
      <Section title="Haftung für Links">
        <p>
          Für die Inhalte verlinkter Seiten anderer Anbieter (z. B. Stripe) sind ausschliesslich deren Betreiber verantwortlich.
        </p>
      </Section>
    </div>
  );
}

export function TermsText() {
  return (
    <div className="legal">
      <p className="legal__date">Stand: {TERMS_DATE}</p>

      <Section title="1. Geltungsbereich">
        <p>
          Diese Nutzungsbedingungen gelten für die App phonegames (phonegames.app) von <Value>{OPERATOR.name}</Value> («wir»). Mit
          der Registrierung akzeptierst du sie. Wie wir mit deinen Daten umgehen, steht in der Datenschutzerklärung.
        </p>
      </Section>

      <Section title="2. Was phonegames bietet">
        <p>
          phonegames ist eine Web-App mit Spielen für eine Runde auf einem Handy und mit Lernfunktionen: Lernstapel erfassen (auch
          per Foto), mit dem Kartenkasten und weiteren Spielformen lernen und Lernstapel per Link teilen. Deine Daten werden
          zwischen deinen Geräten synchronisiert.
        </p>
        <p>
          Wir entwickeln phonegames laufend weiter; Funktionen können sich ändern, dazukommen oder wegfallen. Wir bemühen uns um
          einen zuverlässigen Betrieb, können aber keine ununterbrochene Verfügbarkeit garantieren (z. B. bei Wartung oder
          Störungen).
        </p>
      </Section>

      <Section title="3. Konto">
        <ul>
          <li>Ein Konto eröffnen Erwachsene ab 18 Jahren. Kinder nutzen phonegames über das Konto ihrer Eltern oder einer anderen erwachsenen Person, die dafür verantwortlich ist.</li>
          <li>Ein Konto ist für dich und deinen Haushalt gedacht – zum Beispiel für die ganze Familie auf mehreren Geräten.</li>
          <li>Deine Angaben müssen stimmen. Halte dein Passwort geheim und melde dich bei uns, wenn jemand dein Konto missbraucht.</li>
        </ul>
      </Section>

      <Section title="4. Jahresabo und Preise">
        <ul>
          <li>
            Ein Konto ohne Einladungscode braucht ein Jahresabo. Die ersten 7 Tage sind gratis (einmal pro Konto). Danach kostet
            das Abo CHF 5 pro Jahr. Alle Preise sind Endpreise in Schweizer Franken.
          </li>
          <li>
            Bezahlt wird über unseren Zahlungsdienstleister Stripe – mit TWINT, Apple Pay, Google Pay oder Karte, je nach Angebot.
            Für die Zahlung gelten zusätzlich die Bedingungen von Stripe und des gewählten Zahlungsmittels.
          </li>
          <li>
            Das Abo verlängert sich automatisch um ein Jahr, wenn du es nicht vorher kündigst. Der Betrag wird am Ende der
            Testphase und danach zu Beginn jedes Abojahres belastet.
          </li>
          <li>
            Du kannst jederzeit unter «Konto → Abo verwalten» kündigen. Das Abo endet dann mit der Testphase bzw. dem laufenden
            Abojahr. Kündigst du in der Testphase, bezahlst du nichts. Für ein angebrochenes Abojahr erstatten wir nichts zurück.
          </li>
          <li>Schlägt eine Zahlung fehl, ist die App bis zur erfolgreichen Zahlung gesperrt. Deine Daten bleiben erhalten.</li>
          <li>
            Preisänderungen kündigen wir mindestens 30 Tage vor Beginn des nächsten Abojahres an. Bist du nicht einverstanden,
            kannst du bis dahin kündigen.
          </li>
          <li>Konten mit Einladungscode und Konten, die vor der Einführung des Jahresabos eröffnet wurden, sind kostenlos.</li>
        </ul>
      </Section>

      <Section title="5. Deine Inhalte">
        <ul>
          <li>
            Was du erfasst – Lernstapel, Fotos, Spielgruppen –, gehört dir. Du erlaubst uns, es zu speichern und zu verarbeiten,
            soweit das für phonegames nötig ist (z. B. Synchronisieren, Foto-Auswertung, Teilen).
          </li>
          <li>Lade nur Fotos und Texte hoch, die du dafür verwenden darfst, und gib Personendaten Dritter nur ein, wenn es nötig ist (für Mitspielende genügt ein Vorname).</li>
          <li>
            Wenn du einen Lernstapel per Link teilst, bist du dafür verantwortlich, dass du die Inhalte weitergeben darfst – zum
            Beispiel Aufgaben aus Lehrmitteln, die urheberrechtlich geschützt sind. Wer den Link hat, sieht eine Vorschau und kann
            eine Kopie übernehmen. Du kannst das Teilen jederzeit beenden.
          </li>
        </ul>
      </Section>

      <Section title="6. Foto-Auswertung mit KI">
        <p>
          Lernkarten aus Fotos erstellt ein KI-Modell automatisch. Die Karten können Fehler enthalten – prüfe sie, bevor du damit
          lernst. Pro Konto steht ein monatliches Kontingent an Auswertungen zur Verfügung.
        </p>
      </Section>

      <Section title="7. Nicht erlaubt">
        <p>
          Rechtswidrige oder verletzende Inhalte, Angriffe auf phonegames oder andere Nutzerinnen und Nutzer, automatisierte
          Massenabfragen, das Umgehen von Sperren und Limiten sowie der Weiterverkauf von phonegames sind nicht erlaubt.
        </p>
      </Section>

      <Section title="8. Haftung">
        <p>
          phonegames wird so angeboten, wie es ist. Für leichte Fahrlässigkeit haften wir nicht, soweit das Gesetz es erlaubt;
          die Haftung für Vorsatz und grobe Fahrlässigkeit bleibt bestehen. Sichere wichtige Inhalte bei Bedarf mit dem
          Datenexport unter «Konto». Die Spiele sind zur Unterhaltung gedacht – spielt mit Rücksicht aufeinander.
        </p>
      </Section>

      <Section title="9. Sperrung und Ende">
        <ul>
          <li>Du kannst dein Konto jederzeit unter «Konto» löschen. Ein laufendes Abo endet damit sofort, ohne Rückerstattung.</li>
          <li>Verstösst ein Konto gegen diese Bedingungen, können wir es sperren oder löschen.</li>
          <li>
            Stellen wir phonegames ein, kündigen wir das mindestens 30 Tage im Voraus an und erstatten bezahlte, nicht mehr nutzbare
            Abozeit anteilig zurück.
          </li>
        </ul>
      </Section>

      <Section title="10. Änderungen dieser Bedingungen">
        <p>
          Wir können diese Bedingungen anpassen. Die neue Fassung zeigen wir in der App an; sie gilt, sobald du zustimmst. Bist du
          nicht einverstanden, kannst du dein Konto löschen.
        </p>
      </Section>

      <Section title="11. Recht und Gerichtsstand">
        <p>
          Es gilt Schweizer Recht. Gerichtsstand ist der Sitz des Betreibers; zwingende Gerichtsstände für Konsumentinnen und
          Konsumenten bleiben vorbehalten.
        </p>
      </Section>

      <Section title="Kontakt">
        <p>
          <Operator />
          <br />
          <Email />
        </p>
      </Section>
    </div>
  );
}

export function PrivacyText() {
  return (
    <div className="legal">
      <p className="legal__date">Stand: {TERMS_DATE}</p>

      <Section title="1. Wer verantwortlich ist">
        <p>
          <Operator />
          <br />
          E-Mail: <Email />
        </p>
      </Section>

      <Section title="2. Grundsätze">
        <p>
          Wir bearbeiten so wenige Personendaten wie möglich und nur, um phonegames zu betreiben. Es gibt keine Werbung, kein
          Tracking und keine Analyse-Werkzeuge. Wir verkaufen keine Daten. Massgebend ist das Schweizer Datenschutzgesetz (DSG);
          soweit die Datenschutz-Grundverordnung der EU (DSGVO) anwendbar ist, stützen wir uns auf die Erfüllung des
          Nutzungsvertrags und auf unser berechtigtes Interesse an einem sicheren Betrieb.
        </p>
      </Section>

      <Section title="3. Welche Daten wir bearbeiten">
        <ul>
          <li>
            <strong>Konto:</strong> Name, E-Mail-Adresse, Passwort (nur als sicherer Hash, nie im Klartext), Avatar, Datum der
            Registrierung sowie Version und Zeitpunkt deiner Zustimmung zu diesen Texten.
          </li>
          <li>
            <strong>Passkeys:</strong> der öffentliche Schlüssel und der Name des Geräts. Fingerabdruck und Gesichtserkennung
            bleiben auf deinem Gerät.
          </li>
          <li>
            <strong>Was du in der App erfasst:</strong> deine Spieleliste, Spielgruppen mit Vornamen und Farben der Mitspielenden,
            Lernstapel, der Lernstand pro lernender Person (Vorname, Fächer, Lerntage) und geteilte Lernstapel (eine Kopie der
            Karten sowie die Zahl der Übernahmen).
          </li>
          <li>
            <strong>Fotos für Lernstapel:</strong> Der Server leitet die Fotos zur Auswertung an die KI von Infomaniak weiter. Sie
            werden weder gespeichert noch protokolliert – es bleiben nur die erkannten Karten. Die KI ist angewiesen, Namen,
            Noten und Unterschriften wegzulassen.
          </li>
          <li>
            <strong>Erzählstimme:</strong> Sätze der Spiele (sie können Vornamen von Mitspielenden enthalten) wandelt unser Server
            in Sprache um. Die Tonaufnahmen werden ohne Bezug zu deinem Konto zwischengespeichert und laufend ersetzt.
          </li>
          <li>
            <strong>Jahresabo:</strong> Zahlungsdaten (Karte, TWINT usw.) gibst du nur bei Stripe ein; wir sehen sie nicht. Wir
            speichern die Kunden- und Abonummer bei Stripe, den Status des Abos und das Ablaufdatum.
          </li>
          <li>
            <strong>Technische Daten:</strong> ein Sitzungs-Cookie für die Anmeldung (technisch notwendig, bis 180 Tage),
            Browserangaben deiner Sitzungen sowie IP-Adressen in den Server-Protokollen und zum Schutz vor Missbrauch.
          </li>
          <li>
            <strong>Auf deinem Gerät:</strong> Einstellungen und eine Kopie deiner Daten im Speicher des Browsers, damit
            phonegames auch offline funktioniert. Beim Abmelden werden deine Daten vom Gerät entfernt; Einstellungen wie Töne
            bleiben.
          </li>
        </ul>
      </Section>

      <Section title="4. Wofür">
        <p>
          Um dein Konto zu führen, die App bereitzustellen und deine Daten zwischen deinen Geräten zu synchronisieren, um Fotos
          in Lernkarten umzuwandeln, um das Abo abzurechnen, um phonegames vor Missbrauch zu schützen und Fehler zu beheben.
        </p>
      </Section>

      <Section title="5. Wer Daten erhält">
        <ul>
          <li>
            <strong>Infomaniak Network AG, Genf (Schweiz):</strong> betreibt den Server, auf dem phonegames läuft, und die KI für
            die Foto-Auswertung – beides in Rechenzentren in der Schweiz.
          </li>
          <li>
            <strong>Stripe Payments Europe Ltd., Dublin (Irland):</strong> wickelt die Zahlungen ab. Stripe bearbeitet Daten auch
            in den USA (Stripe, Inc.) und ist dafür nach eigenen Angaben unter dem Data Privacy Framework zertifiziert. Es gilt zusätzlich die
            Datenschutzerklärung von Stripe.
          </li>
          <li>Personen, mit denen du einen Lernstapel teilst, sehen die Karten dieses Stapels – nicht deinen Lernstand und nicht deinen Namen.</li>
          <li>Darüber hinaus geben wir Daten nur weiter, wenn das Gesetz uns dazu verpflichtet.</li>
        </ul>
      </Section>

      <Section title="6. Wie lange">
        <ul>
          <li>Deine Konto- und App-Daten, bis du sie löschst oder dein Konto löschst.</li>
          <li>Gelöschte Einträge bleiben höchstens 180 Tage als Löschvermerk, damit sie auch auf deinen anderen Geräten verschwinden.</li>
          <li>Sicherungskopien der Datenbank bewahren wir 14 Tage auf.</li>
          <li>Server-Protokolle werden nach kurzer Zeit laufend überschrieben.</li>
          <li>Belege zu Zahlungen bewahren wir und Stripe so lange auf, wie es das Gesetz verlangt (in der Regel 10 Jahre).</li>
        </ul>
      </Section>

      <Section title="7. Sicherheit">
        <p>
          Die Verbindung ist verschlüsselt (HTTPS). Passwörter speichern wir nur als Hash. Der Server steht in der Schweiz; nur
          der Betreiber hat Zugriff.
        </p>
      </Section>

      <Section title="8. Deine Rechte">
        <ul>
          <li>
            <strong>Auskunft und Herausgabe:</strong> Unter «Konto → Meine Daten exportieren» erhältst du alle Daten deines Kontos.
          </li>
          <li>
            <strong>Berichtigung und Löschung:</strong> Name und E-Mail änderst du unter «Konto»; dort kannst du dein Konto samt
            allen Daten auch selbst löschen.
          </li>
          <li>Für Fragen, Widerspruch oder weitere Anliegen schreib uns: <Email /></li>
          <li>
            Du kannst dich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) beschweren, in der EU bei der
            Datenschutzbehörde deines Wohnsitzlands.
          </li>
        </ul>
      </Section>

      <Section title="9. Kinder">
        <p>
          Kinder nutzen phonegames über das Konto einer erwachsenen Person. Diese entscheidet, welche Namen sie für Mitspielende
          und Lernende erfasst – ein Vorname genügt.
        </p>
      </Section>

      <Section title="10. Änderungen">
        <p>Wenn wir diese Datenschutzerklärung ändern, zeigen wir die neue Fassung in der App an.</p>
      </Section>
    </div>
  );
}
