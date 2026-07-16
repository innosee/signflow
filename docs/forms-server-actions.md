# Formulare mit Server-Actions: Eingaben nie verlieren

**Regel:** Ein Formular, das an eine Server-Action submitted, muss den vom User
getippten Inhalt **behalten, wenn die Action fehlschlägt** (Validierungsfehler,
falsches Secret, Serverfehler). Nichts ist frustrierender, als eine lange
Eingabe neu tippen zu müssen, weil ein Feld weiter oben falsch war.

## Warum das ständig passiert (React 19)

Bei `<form action={serverAction}>` (React 19 / Next App Router) wird das Form
nach dem Durchlauf der Action **automatisch zurückgesetzt**. Ein
**uncontrolled** `<input>` / `<textarea>` (nur `name`, kein `value` oder
`defaultValue` aus State) verliert dabei seinen Inhalt — auch wenn die Action
einen Fehler zurückgibt und der User nur „nochmal" will.

Symptom: „Ich klicke Absenden, es kommt eine Fehlermeldung, und alle Felder
sind leer."

Verwandt: **controlled und uncontrolled im selben Feld mischen** (oder ein
`key` am Feld ändern) triggert denselben Reset — siehe den `/register`-Vorfall.
Ein Feld ist entweder durchgehend controlled ODER durchgehend uncontrolled.

## Zwei erlaubte Muster

### A. Controlled State (wenige Felder, oder Wert wird client-seitig gebraucht)

Feld hängt an `useState`; nach **Erfolg** explizit leeren, bei Fehler bleibt es
von selbst stehen.

```tsx
const [title, setTitle] = useState("");
const [body, setBody] = useState("");
const [state, action, pending] = useActionState(createEntry, undefined);

// Nur bei Erfolg leeren — bei Fehler bleibt die Eingabe erhalten.
useEffect(() => {
  if (state?.success) { setTitle(""); setBody(""); }
}, [state?.success]);

<form action={action}>
  <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} />
  <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} />
</form>
```

Beispiel im Repo: das Operator-Secret in [operator/changelog/editor.tsx](../app/operator/changelog/editor.tsx)
war schon immer controlled — deshalb hat es Form-Resets überlebt. Seit dem Fix
sind Titel + Text dort genauso controlled.

### B. Werte-Echo + `defaultValue` (viele Felder)

Die Action gibt bei Fehler die eingegebenen Werte in ihrem State zurück; die
Felder seeden daraus `defaultValue`. Nach dem Reset stellt React die getippten
Werte wieder her.

```tsx
// action:
return { error: "…", values: { topic, modus, … } };

// form:
<textarea name="topic" defaultValue={state?.values?.topic ?? ""} />
<select name="modus" defaultValue={state?.values?.modus ?? "praesenz"} />
```

Referenz-Implementierung: [sessions/new/session-form.tsx](../app/coach/courses/[id]/sessions/new/session-form.tsx)
+ `readSessionFormValues` in [sessions actions.ts](../app/coach/courses/[id]/actions.ts)
(sucht nach `values:` im Rückgabe-State). Diese Variante hält sogar
komplexe Felder (Eignungsanalyse) über den Fehler.

**Wann was:** 1–3 Felder → A (einfacher). Viele/komplexe Felder oder ein Form,
das ohnehin serverseitig validiert → B.

## Anti-Pattern (nicht tun)

```tsx
// ❌ uncontrolled Feld in einem Server-Action-Form: Inhalt weg bei Fehler
<form action={action}>
  <input name="title" />          {/* kein value, kein defaultValue */}
  <textarea name="body" />
</form>
```

## Review-Checkliste

Bei jedem Form mit `action={serverAction}`:
- [ ] Hat jedes Text-/Auswahlfeld entweder `value` (controlled) **oder**
      `defaultValue={state?.values?.…}` (Echo)?
- [ ] Kein Feld mischt controlled/uncontrolled, kein wechselnder `key`?
- [ ] Bei Muster A: werden die Felder **nur bei Erfolg** geleert, nicht bei
      Fehler?
- [ ] Fehler- UND Erfolgsmeldung werden gerendert (`state?.error` /
      `state?.success`)?
