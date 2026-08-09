"use client";

import { useActionState, useState } from "react";

import { submitTnbCode, type TnbGateState } from "./actions";

const INITIAL: TnbGateState = { error: null };

/** Zugangscode-Eingabe für die öffentliche /tnb-App. */
export function TnbGate() {
  const [state, formAction, pending] = useActionState(submitTnbCode, INITIAL);
  const [code, setCode] = useState("");

  return (
    <div className="tnb-gate">
      <form action={formAction} className="tnb-gate-card">
        <h1>Teilnahmebescheinigung</h1>
        <p className="tnb-gate-sub">
          Dieser Bereich ist mit einem Zugangscode geschützt.
        </p>
        <label className="tnb-gate-label" htmlFor="tnb-code">
          Zugangscode
        </label>
        <input
          id="tnb-code"
          name="code"
          type="password"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="tnb-gate-input"
          placeholder="Code eingeben"
        />
        {state.error ? <p className="tnb-gate-error">{state.error}</p> : null}
        <button type="submit" disabled={pending} className="tnb-gate-btn">
          {pending ? "Prüfe…" : "Weiter"}
        </button>
      </form>

      <style>{css}</style>
    </div>
  );
}

const css = `
.tnb-gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f4f4f5;
  padding: 24px;
  box-sizing: border-box;
}
.tnb-gate-card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 16px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tnb-gate-card h1 { font-size: 20px; font-weight: 700; margin: 0; color: #18181b; }
.tnb-gate-sub { font-size: 13px; color: #52525b; margin: 0 0 8px 0; }
.tnb-gate-label { font-size: 12.5px; font-weight: 600; color: #3f3f46; }
.tnb-gate-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d4d4d8;
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 14px;
  color: #18181b;
  background: #fff;
}
.tnb-gate-input:focus {
  outline: 2px solid #14545f;
  outline-offset: 0;
  border-color: #14545f;
}
.tnb-gate-error { color: #dc2626; font-size: 13px; margin: 2px 0 0 0; }
.tnb-gate-btn {
  margin-top: 6px;
  background: #14545f;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 11px 18px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.tnb-gate-btn:hover:enabled { background: #0f4149; }
.tnb-gate-btn:disabled { background: #a1a1aa; cursor: not-allowed; }
`;
