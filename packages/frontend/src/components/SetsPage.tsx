import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSets, type CardSet } from "../api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Layers } from "lucide-react";

export function SetsPage() {
  const [sets, setSets] = useState<CardSet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSets()
      .then((res) => setSets(res.sets))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <Layers className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Card Sets</h1>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading sets...</p>
      ) : sets.length === 0 ? (
        <p className="text-muted-foreground">No sets found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Set Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Cards</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sets.map((s) => (
                <TableRow key={s.setCode}>
                  <TableCell>
                    <Link
                      to={`/search?q=&set=${s.setCode}`}
                      className="text-primary hover:underline font-medium"
                    >
                      {s.setName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {s.setCode}
                    </code>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.cardCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
