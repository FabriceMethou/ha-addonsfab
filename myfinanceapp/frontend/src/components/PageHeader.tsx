interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Optional accent color for the left border strip e.g. "border-l-blue-500" */
  accentColor?: string;
}

export default function PageHeader({
  title,
  description,
  actions,
  accentColor,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className={accentColor ? `pl-4 border-l-2 ${accentColor}` : ''}>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-foreground-muted mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
