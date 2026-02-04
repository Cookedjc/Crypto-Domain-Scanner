import { useScan } from "@/hooks/use-scans";
import { useRoute } from "wouter";
import Layout from "@/components/layout";
import { Loader2, ArrowLeft, Shield, Lock, AlertTriangle, CheckCircle, Terminal } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

export default function ScanDetails() {
  const [, params] = useRoute("/scans/:id");
  const id = parseInt(params?.id || "0");
  const { data: scan, isLoading, error } = useScan(id);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="w-16 h-16 text-primary animate-spin mb-4" />
          <h2 className="text-xl font-display font-medium">Retrieving cryptographic data...</h2>
          <p className="text-muted-foreground font-mono text-sm mt-2">Connecting to analysis engine</p>
        </div>
      </Layout>
    );
  }

  if (error || !scan) {
    return (
      <Layout>
        <div className="text-center py-20">
          <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold">Scan Not Found</h2>
          <p className="text-muted-foreground mb-6">The requested analysis report could not be retrieved.</p>
          <Link href="/">
            <Button>Return Dashboard</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const details = scan.details as any;
  const isPending = scan.score === null;

  // Mock data for radar chart if real metrics aren't detailed enough
  const chartData = [
    { subject: 'Protocol', A: isPending ? 0 : 90, fullMark: 100 },
    { subject: 'Key Exchange', A: isPending ? 0 : 85, fullMark: 100 },
    { subject: 'Cipher Strength', A: isPending ? 0 : scan.score || 70, fullMark: 100 },
    { subject: 'Certificate', A: isPending ? 0 : 95, fullMark: 100 },
    { subject: 'PQC Readiness', A: isPending ? 0 : (scan.pqcStatus === 'Ready' ? 100 : scan.pqcStatus === 'Partial' ? 50 : 20), fullMark: 100 },
  ];

  return (
    <Layout>
      {/* Navigation & Header */}
      <div className="mb-8">
        <Link href="/">
          <Button variant="ghost" className="pl-0 hover:pl-2 transition-all text-muted-foreground mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </Link>
        
        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-display font-bold text-foreground">{scan.domain}</h1>
              <Badge variant="outline" className="font-mono text-xs">PORT {scan.port}</Badge>
            </div>
            <p className="text-muted-foreground font-mono text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Scan ID: {scan.id} • {new Date(scan.createdAt!).toLocaleString()}
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.print()}>Export Report</Button>
            <Button onClick={() => window.location.reload()}>Rescan Target</Button>
          </div>
        </div>
      </div>

      {isPending ? (
        <PendingState />
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {/* High-level Score Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Score Gauge */}
            <Card className="col-span-1 border-primary/20 bg-card/50 backdrop-blur overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Shield className="w-32 h-32" />
              </div>
              <CardHeader>
                <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Security Score</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center pt-2">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="Security"
                        dataKey="A"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-4xl font-bold font-mono text-primary">{scan.score}</span>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <Badge variant={scan.score! >= 80 ? "default" : "destructive"} className="px-4 py-1 text-base">
                    Grade {scan.grade || "B"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Key Metrics */}
            <Card className="col-span-1 md:col-span-2 border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Cryptographic Parameters</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground uppercase font-semibold">Post-Quantum Status</label>
                  <div className="flex items-center gap-2">
                    {scan.pqcStatus === 'Ready' ? (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className="text-lg font-medium">{scan.pqcStatus}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    {scan.pqcStatus === 'Ready' 
                      ? "This configuration uses quantum-resistant algorithms."
                      : "Upgrade to hybrid key exchange (e.g., X25519Kyber768) recommended."}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground uppercase font-semibold">Protocol Version</label>
                  <div className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-blue-500" />
                    <span className="text-lg font-medium">{scan.protocolVersion}</span>
                  </div>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-muted-foreground uppercase font-semibold">Cipher Suite</label>
                  <code className="block mt-1 p-3 bg-black/40 rounded-lg border border-border font-mono text-sm text-primary">
                    {scan.cipherName}
                  </code>
                </div>
                
                <div className="space-y-1 sm:col-span-2">
                   <label className="text-xs text-muted-foreground uppercase font-semibold">Key Exchange / KEM</label>
                   <div className="text-sm font-mono text-foreground flex flex-col gap-1">
                     <span className="text-primary">{scan.keyExchange}</span>
                     {details?.kem && details.kem !== scan.keyExchange && details.kem !== "Unknown" && (
                       <span className="text-xs text-muted-foreground italic">
                         Mechanism: {details.kem}
                       </span>
                     )}
                   </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Technical Details / Vulnerabilities */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="col-span-1 md:col-span-2 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-primary" />
                  Technical Analysis Log
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">OpenSSL Command Executed</h4>
                  <code className="block p-3 bg-black/60 rounded-lg border border-border/50 font-mono text-xs text-emerald-400">
                    $ {details?.command || "openssl s_client -connect " + scan.domain + ":" + scan.port + " -tls1_3"}
                  </code>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Cryptographic Negotiation (Key Share / Groups)</h4>
                  <pre className="block p-4 bg-black/40 rounded-lg border border-border/50 font-mono text-[10px] text-emerald-500/90 overflow-x-auto max-h-[300px] overflow-y-auto">
                    {scan.rawOutput || "No negotiation details captured."}
                  </pre>
                </div>

                {details?.error && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                    <h4 className="text-xs font-bold text-rose-500 uppercase mb-1">Execution Errors</h4>
                    <p className="text-xs font-mono text-rose-400">{details.error}</p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Detected Ciphers</h4>
                  <div className="flex flex-wrap gap-2">
                    {details?.ciphers?.map((cipher: string, idx: number) => (
                      <Badge key={idx} variant="secondary" className="font-mono text-xs border-border/50">
                        {cipher}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {details?.vulnerabilities && details.vulnerabilities.length > 0 && (
                   <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                     <h4 className="text-sm font-bold text-destructive flex items-center gap-2 mb-2">
                       <AlertTriangle className="w-4 h-4" /> Detected Vulnerabilities
                     </h4>
                     <ul className="list-disc list-inside space-y-1">
                       {details.vulnerabilities.map((vuln: string, i: number) => (
                         <li key={i} className="text-sm text-destructive-foreground/80">{vuln}</li>
                       ))}
                     </ul>
                   </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-mono text-muted-foreground uppercase">Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  <li className="flex gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">1</div>
                    <span className="text-muted-foreground">Disable older TLS 1.0/1.1 protocols immediately.</span>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">2</div>
                    <span className="text-muted-foreground">Implement HSTS with long duration.</span>
                  </li>
                  <li className="flex gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">3</div>
                    <span className="text-muted-foreground">Prepare for PQC by testing hybrid key exchanges.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}
    </Layout>
  );
}

function PendingState() {
  return (
    <div className="max-w-2xl mx-auto text-center py-20 space-y-8">
      <div className="relative w-32 h-32 mx-auto">
        <div className="absolute inset-0 border-4 border-muted rounded-full"></div>
        <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
        <Shield className="absolute inset-0 m-auto w-12 h-12 text-primary animate-pulse" />
      </div>
      
      <div className="space-y-4">
        <h2 className="text-2xl font-display font-bold">Analysis in Progress</h2>
        <div className="space-y-2 max-w-md mx-auto">
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>Handshake</span>
            <span className="text-emerald-500">Done</span>
          </div>
          <Progress value={66} className="h-1" />
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>Cipher Enumeration</span>
            <span className="animate-pulse">Running...</span>
          </div>
          <div className="flex justify-between text-xs font-mono text-muted-foreground opacity-50">
            <span>PQC Evaluation</span>
            <span>Pending</span>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">This may take up to 60 seconds. Do not close this window.</p>
      </div>
    </div>
  );
}
