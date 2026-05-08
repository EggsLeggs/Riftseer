import { NavigationMenu } from "@/components/ui/navigation-menu";

export function Navbar() {
  return (
    <header className="border-b border-border">
      <div className="container flex items-center justify-between py-3">
        <span className="font-semibold text-sm">INSERT LOGO</span>
        <NavigationMenu>
          <span className="text-sm text-muted-foreground">INSERT USER ICON</span>
        </NavigationMenu>
      </div>
    </header>
  );
}
