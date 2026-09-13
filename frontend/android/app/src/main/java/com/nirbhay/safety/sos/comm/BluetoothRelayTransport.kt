package com.nirbhay.safety.sos.comm

import com.nirbhay.safety.sos.data.SosEventEntity

sealed class RelayResult {
    object NotSupported : RelayResult()
}

/**
 * Future offline mesh-relay path (next.md §6), intentionally unimplemented
 * this pass — this class only locks in the abstraction shape so a real
 * implementation can slot in later without restructuring CommunicationManager:
 *
 *   Jāgriti User A -> Bluetooth -> Nearby Jāgriti Device B
 *                  -> Bluetooth/Internet -> Jāgriti Backend -> Emergency Contact
 *
 * Only nearby *participating* Jāgriti devices could ever act as relay
 * nodes. Must never report success — a stub that claims delivery would
 * violate next.md's explicit "do not falsely represent Bluetooth relay as
 * guaranteed communication" requirement.
 */
class BluetoothRelayTransport {
    fun relay(event: SosEventEntity): RelayResult = RelayResult.NotSupported
}
