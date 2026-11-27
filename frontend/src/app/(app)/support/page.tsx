import { PageHeader } from "@/components/domain";
import { Card, CardHeader } from "@/components/ui/primitives";
import { HelpCircle, Phone } from "lucide-react";

export const metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Support" description="Help with using Albo." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<HelpCircle />} title="About Albo" />
          <p className="text-sm text-ink-soft">
            Albo helps you keep track of lifestyle information, see explainable preventive indicators, and find health facilities.
            It is not a doctor, does not diagnose, and is not an emergency service.
          </p>
        </Card>
        <Card className="border border-high/20">
          <CardHeader icon={<Phone />} title="Urgent help" />
          <p className="text-sm text-ink-soft">
            If you feel very unwell, are injured, or are thinking about harming yourself, contact local emergency services or go to the nearest health facility now.
          </p>
        </Card>
      </div>
    </div>
  );
}
