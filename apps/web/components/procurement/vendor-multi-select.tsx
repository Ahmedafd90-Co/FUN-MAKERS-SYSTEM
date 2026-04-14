'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@fmksa/ui/components/button';
import { Badge } from '@fmksa/ui/components/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@fmksa/ui/components/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@fmksa/ui/components/popover';
import { cn } from '@fmksa/ui/lib/utils';

type VendorOption = {
  id: string;
  vendorId: string;
  name: string;
};

type Props = {
  vendors: VendorOption[];
  selected: string[];
  onChange: (vendorIds: string[]) => void;
  disabled?: boolean;
  isLoading?: boolean;
};

/**
 * Multi-select combobox for project vendors.
 * Uses shadcn Command (cmdk) for search + select.
 */
export function VendorMultiSelect({
  vendors,
  selected,
  onChange,
  disabled,
  isLoading,
}: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (vendorId: string) => {
    if (selected.includes(vendorId)) {
      onChange(selected.filter((id) => id !== vendorId));
    } else {
      onChange([...selected, vendorId]);
    }
  };

  const selectedNames = vendors
    .filter((v) => selected.includes(v.vendorId))
    .map((v) => v.name);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading}
            className="w-full justify-between font-normal"
          >
            <span className="truncate text-sm">
              {isLoading
                ? 'Loading vendors...'
                : selected.length === 0
                  ? 'Select vendors to invite...'
                  : `${selected.length} vendor${selected.length === 1 ? '' : 's'} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search vendors..." />
            <CommandList>
              <CommandEmpty>No vendors found.</CommandEmpty>
              <CommandGroup>
                {vendors.map((v) => (
                  <CommandItem
                    key={v.vendorId}
                    value={v.name}
                    onSelect={() => toggle(v.vendorId)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selected.includes(v.vendorId) ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {v.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedNames.map((name) => (
            <Badge key={name} variant="secondary" className="text-xs">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
