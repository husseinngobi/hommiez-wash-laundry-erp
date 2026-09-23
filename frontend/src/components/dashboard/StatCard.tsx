import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'secondary' | 'accent';
}

const variantStyles = {
  default: 'bg-card',
  primary: 'bg-primary/5 border-primary/20',
  secondary: 'bg-secondary/10 border-secondary/30',
  accent: 'bg-accent/10 border-accent/30',
};

const iconStyles = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  accent: 'bg-accent text-accent-foreground',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'default',
}: StatCardProps) {
  return (
    <div className={cn('stat-card animate-fade-in', variantStyles[variant])}>
      <div className="flex items-start gap-4">
        {/* Content */}
        <div className="min-w-0 flex-1 pr-1">
          <p className="text-sm font-medium text-muted-foreground">
            {title}
          </p>

          <p
            className="
              mt-2
              text-3xl
              font-bold
              text-foreground
              leading-tight
              [overflow-wrap:anywhere]
            "
          >
            {value}
          </p>

          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}

          {trend && (
            <div
              className={cn(
                'mt-2 inline-flex items-center text-sm font-medium',
                trend.isPositive
                  ? 'text-success'
                  : 'text-destructive'
              )}
            >
              <span>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>

              <span className="ml-1 text-muted-foreground">
                vs last week
              </span>
            </div>
          )}
        </div>

        {/* Icon */}
        <div
          className={cn(
            'shrink-0 p-3 rounded-xl',
            iconStyles[variant]
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}