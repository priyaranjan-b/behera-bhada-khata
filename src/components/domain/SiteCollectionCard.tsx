import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { SectionCard } from "@/components/ui";
import { StatusBadge } from "@/components/ui/DataDisplay";
import { collectionRateTone, type SiteCollection } from "@/lib/domain/overview";
import { formatMoney } from "@/lib/money";

/** Overview: the selected month's expected vs collected rent per site, and each site's arrears. */
export default function SiteCollectionCard({ sites, monthLabel }: { sites: SiteCollection[]; monthLabel: string }) {
  return (
    <SectionCard title="Collection by site" caption={`${monthLabel} · arrears to the end of last month`} fill>
      <Table size="small" aria-label={`Rent expected and collected per site, ${monthLabel}`}>
        <TableHead>
          <TableRow>
            <TableCell>Site</TableCell>
            <TableCell align="right">Expected</TableCell>
            <TableCell align="right">Collected</TableCell>
            <TableCell align="right">Arrears</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sites.map((s) => (
            <TableRow key={s.siteCode}>
              <TableCell>
                <Typography variant="body2">{s.siteName}</Typography>
                <Typography variant="caption" color="textSecondary">
                  {s.siteCode}
                </Typography>
              </TableCell>
              <TableCell align="right">{s.expected > 0 ? formatMoney(s.expected) : "—"}</TableCell>
              <TableCell align="right">
                {s.collectionRate === null ? (
                  "—"
                ) : (
                  <>
                    <Typography variant="body2">{formatMoney(s.collected)}</Typography>
                    <StatusBadge tone={collectionRateTone(s.collectionRate)} label={`${s.collectionRate}%`} />
                  </>
                )}
              </TableCell>
              <TableCell align="right">{s.outstanding > 0 ? formatMoney(s.outstanding) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
