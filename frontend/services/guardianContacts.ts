import type { EmergencyContact } from '../store/tripStore';
import { addEmergencyContact } from './api';
import { seedEmergencyContacts } from './BackgroundMotionService';

/**
 * Builds the emergency-contacts list the native Room table and the
 * backend's emergency_contacts table both expect, from the 3 flat
 * guardian-phone fields (kept as the input UI — see store/tripStore.ts
 * deprecation note on guardianPhone/2/3). Empty numbers are dropped.
 */
export function buildGuardianContacts(primary: string, secondary: string, tertiary: string): EmergencyContact[] {
  return [
    { id: 'guardian-1', name: 'Primary Guardian', phoneNumber: primary, priority: 1, isPrimary: true },
    { id: 'guardian-2', name: 'Guardian 2', phoneNumber: secondary, priority: 2, isPrimary: false },
    { id: 'guardian-3', name: 'Guardian 3', phoneNumber: tertiary, priority: 3, isPrimary: false },
  ].filter((c) => c.phoneNumber && c.phoneNumber.length > 0);
}

/**
 * Pushes contacts to the native Room table (used for fully-offline SMS)
 * and to the backend's emergency_contacts table.
 */
export async function syncEmergencyContacts(contacts: EmergencyContact[]): Promise<void> {
  await seedEmergencyContacts(contacts);
  for (const contact of contacts) {
    await addEmergencyContact({
      name: contact.name,
      phone_number: contact.phoneNumber,
      priority: contact.priority,
      is_primary: contact.isPrimary,
    });
  }
}
