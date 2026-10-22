import { useEffect, useRef, useState, type ReactNode } from "react";
export interface Field {
  key: string;
  label: string;
  value?: string;
  multiline?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  options?: { value: string; label: string }[];
}
export interface DialogRequest {
  title: string;
  description?: string;
  fields?: Field[];
  body?: ReactNode;
  submit?: string;
  action?: (values: Record<string, string>) => void | Promise<void>;
  danger?: boolean;
}
export function Dialog({
  request,
  close,
  t,
}: {
  request: DialogRequest;
  close: () => void;
  t: (key: string) => string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [values, setValues] = useState(
      Object.fromEntries(
        (request.fields ?? []).map((f) => [f.key, f.value ?? ""]),
      ),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current!.showModal();
    const dialog = ref.current!;
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await request.action?.(values);
            close();
          } catch (err) {
            setError(t((err as Error).message));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="dialog-title">{t(request.title)}</h2>
        {request.description && <p>{t(request.description)}</p>}
        {request.body}
        {request.fields?.map((f) => (
          <label className="field" key={f.key}>
            <span>{t(f.label)}</span>
            {f.options ? (
              <select
                value={values[f.key]}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: e.target.value })
                }
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.label)}
                  </option>
                ))}
              </select>
            ) : f.multiline ? (
              <textarea
                rows={10}
                value={values[f.key]}
                placeholder={f.placeholder}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: e.target.value })
                }
                required={!f.allowEmpty}
              />
            ) : (
              <input
                value={values[f.key]}
                placeholder={f.placeholder}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: e.target.value })
                }
                required={!f.allowEmpty}
              />
            )}
          </label>
        ))}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close} disabled={busy}>
            {t("Cancel")}
          </button>
          {request.action && (
            <button
              className={request.danger ? "danger" : "primary"}
              disabled={busy}
              type="submit"
            >
              {t(busy ? "Working…" : (request.submit ?? "Apply"))}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
