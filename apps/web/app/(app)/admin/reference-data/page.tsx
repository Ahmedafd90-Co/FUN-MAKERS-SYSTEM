'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@fmksa/ui/components/tabs';

import { AppSettingsForm } from '@/components/admin/app-settings-form';
import { CountriesTable } from '@/components/admin/countries-table';
import { CurrenciesTable } from '@/components/admin/currencies-table';
import { StatusDictionaryEditor } from '@/components/admin/status-dictionary-editor';

export default function AdminReferenceDataPage() {
  return (
    <>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Reference Data</h1>
          <p className="text-sm text-muted-foreground">
            System-wide reference data: countries, currencies, app settings, and
            status dictionaries.
          </p>
        </div>

        <Tabs defaultValue="countries" className="w-full">
          <TabsList>
            <TabsTrigger value="countries">Countries</TabsTrigger>
            <TabsTrigger value="currencies">Currencies</TabsTrigger>
            <TabsTrigger value="settings">App Settings</TabsTrigger>
            <TabsTrigger value="status-dicts">Status Dictionaries</TabsTrigger>
          </TabsList>

          <TabsContent value="countries" className="mt-4">
            <CountriesTable />
          </TabsContent>

          <TabsContent value="currencies" className="mt-4">
            <CurrenciesTable />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <AppSettingsForm />
          </TabsContent>

          <TabsContent value="status-dicts" className="mt-4">
            <StatusDictionaryEditor />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
