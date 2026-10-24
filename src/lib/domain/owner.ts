// The owner's name as shown in the app and on receipts (owner_profile, 0013).

/** "Ramesh Sahu"; null without a first name. */
export function ownerFullName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const name = [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
  return name || null;
}

/** Initials for an avatar: "RS" for a name, the email's first letter otherwise. */
export function ownerInitials(name: string | null | undefined, email: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length) return parts.slice(0, 2).map((p) => [...p][0].toUpperCase()).join("");
  return (email?.[0] ?? "O").toUpperCase();
}
