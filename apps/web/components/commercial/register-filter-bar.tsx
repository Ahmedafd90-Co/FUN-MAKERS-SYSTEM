'use client';

import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { Badge } from '@fmksa/ui/components/badge';
import { X, Filter } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type FilterState = {
  statusFilter: string[];
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  createdByFilter?: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
};

type Props = {
  statuses: string[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  showAmountFilter?: boolean;
  children?: React.ReactNode;
};

export function RegisterFilterBar({ statuses, filters, onFilterChange, showAmountFilter = true, children }: Props) {
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  // Sync URL params on mount for dashboard drilldown
  useEffect(() => {
    const urlStatuses = searchParams.getAll('status');
    if (urlStatuses.length > 0 && filters.statusFilter.length === 0) {
      onFilterChange({ ...filters, statusFilter: urlStatuses });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasActiveFilters = filters.statusFilter.length > 0 || filters.dateFrom || filters.dateTo ||
    filters.amountMin !== undefined || filters.amountMax !== undefined || filters.createdByFilter;

  const clearFilters = () => {
    onFilterChange({
      statusFilter: [],
      sortField: filters.sortField,
      sortDirection: filters.sortDirection,
    });
  };

  const toggleStatus = (status: string) => {
    const current = filters.statusFilter;
    const next = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onFilterChange({ ...filters, statusFilter: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
              !
            </Badge>
          )}
        </Button>

        {/* Active status filters as removable pills */}
        {filters.statusFilter.map(s => (
          <Badge key={s} variant="secondary" className="gap-1 capitalize cursor-pointer" onClick={() => toggleStatus(s)}>
            {s.replace(/_/g, ' ')}
            <X className="h-3 w-3" />
          </Badge>
        ))}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">
            Clear all
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {children}
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-md border bg-muted/30">
          {/* Status multi-select */}
          <div className="col-span-2 sm:col-span-4">
            <Label className="text-xs mb-1 block">Status</Label>
            <div className="flex flex-wrap gap-1">
              {statuses.map(s => (
                <Badge
                  key={s}
                  variant={filters.statusFilter.includes(s) ? 'default' : 'outline'}
                  className="cursor-pointer capitalize text-xs"
                  onClick={() => toggleStatus(s)}
                >
                  {s.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <Label className="text-xs mb-1 block">From</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.dateFrom ?? ''}
              onChange={e => {
                const next = { ...filters };
                if (e.target.value) { next.dateFrom = e.target.value; } else { delete next.dateFrom; }
                onFilterChange(next);
              }}
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">To</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.dateTo ?? ''}
              onChange={e => {
                const next = { ...filters };
                if (e.target.value) { next.dateTo = e.target.value; } else { delete next.dateTo; }
                onFilterChange(next);
              }}
            />
          </div>

          {/* Amount range */}
          {showAmountFilter && (
            <>
              <div>
                <Label className="text-xs mb-1 block">Min Amount</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="0"
                  value={filters.amountMin ?? ''}
                  onChange={e => {
                    const next = { ...filters };
                    if (e.target.value) { next.amountMin = Number(e.target.value); } else { delete next.amountMin; }
                    onFilterChange(next);
                  }}
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Max Amount</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  placeholder="0"
                  value={filters.amountMax ?? ''}
                  onChange={e => {
                    const next = { ...filters };
                    if (e.target.value) { next.amountMax = Number(e.target.value); } else { delete next.amountMax; }
                    onFilterChange(next);
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
