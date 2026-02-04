import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Globe, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useCreateScan } from "@/hooks/use-scans";
import { scanRequestSchema } from "@shared/schema";

const formSchema = scanRequestSchema;

export function CreateScanDialog() {
  const [open, setOpen] = useState(false);
  const [customPort, setCustomPort] = useState("");
  const createScan = useCreateScan();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      domain: "",
      ports: [443],
      scanSubdomains: false,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createScan.mutate(values, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
      },
    });
  };

  const addPort = () => {
    const port = parseInt(customPort);
    if (!isNaN(port) && port > 0 && port < 65536) {
      const currentPorts = form.getValues("ports");
      if (!currentPorts.includes(port)) {
        form.setValue("ports", [...currentPorts, port]);
      }
      setCustomPort("");
    }
  };

  const removePort = (portToRemove: number) => {
    const currentPorts = form.getValues("ports");
    if (currentPorts.length > 1) { // Prevent removing last port
      form.setValue("ports", currentPorts.filter(p => p !== portToRemove));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
          <Plus className="w-4 h-4 mr-2" />
          New Security Scan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] border-primary/20 bg-card shadow-2xl shadow-black/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Initiate Domain Analysis</DialogTitle>
          <DialogDescription>
            Enter a domain to begin scanning cryptographic configurations.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField
              control={form.control}
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Target Domain</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="example.com" className="pl-9 font-mono" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Target Ports</FormLabel>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.watch("ports").map((port) => (
                  <Badge key={port} variant="secondary" className="font-mono px-3 py-1 text-xs">
                    {port}
                    <button
                      type="button"
                      onClick={() => removePort(port)}
                      className="ml-2 hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom port..."
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value)}
                  type="number"
                  className="font-mono text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPort())}
                />
                <Button type="button" variant="outline" onClick={addPort}>Add</Button>
              </div>
              <p className="text-xs text-muted-foreground">Common ports: 443 (HTTPS), 8443, 22 (SSH)</p>
            </div>

            <FormField
              control={form.control}
              name="scanSubdomains"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Subdomain Discovery</FormLabel>
                    <FormDescription>
                      Identify and scan associated subdomains
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button 
                type="submit" 
                className="w-full bg-primary font-bold tracking-wide" 
                disabled={createScan.isPending}
              >
                {createScan.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  "Start Analysis"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
