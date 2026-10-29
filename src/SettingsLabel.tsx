/** Shared visual label for reader and teacher settings disclosures. */
export function SettingsLabel({ title }: { title: string }) {
  return <><span className="settings-title">{title}</span><span className="menu-icon" aria-hidden="true">☰</span></>;
}
