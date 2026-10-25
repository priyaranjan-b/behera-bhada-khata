// `modal` is the @modal slot: forms opened from the tenant page (e.g. Record
// payment) render there as a dialog over the page via an intercepted route.
// Loading their URL directly still renders the full page instead.
export default function TenantLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
