type PageHeaderProps = {
  /**
   * Optional short uppercase module/context label rendered above the title.
   * Example: "Commercial", "User management", "Portfolio". Kept inert until
   * callers opt in — existing PageHeader usages render identically.
   */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

// Consumes the brand type scale directly via Tailwind `text-*` tokens
// set up by the preset. Role mapping:
//   eyebrow     -> text-label   (11/16, weight-500, tracking 0.08em, UPPERCASE)
//   title       -> text-heading-page  (24/32, weight-400, tracking -0.005em)
//   description -> text-body-sm (13/20, weight-400, neutral-muted tone)
//
// The title intentionally uses regular weight rather than semibold: the
// brand guide calls for lighter, airier headings — using `text-heading-page`
// gets us that tone without sacrificing legibility at dense-page sizes.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-label uppercase text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-heading-page text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-body-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
