/** Re-mounts on every navigation, so each page's sections settle in top to bottom (.page-enter in globals.css). */
export default function WorkspaceTemplate({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="page-enter">{children}</div>;
}
