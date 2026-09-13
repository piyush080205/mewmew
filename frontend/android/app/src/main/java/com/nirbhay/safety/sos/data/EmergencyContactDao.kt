package com.nirbhay.safety.sos.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface EmergencyContactDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(contact: EmergencyContactEntity)

    @Query("DELETE FROM emergency_contacts")
    suspend fun clearAll()

    @Query("SELECT * FROM emergency_contacts ORDER BY priority ASC")
    suspend fun getAllOrderedByPriority(): List<EmergencyContactEntity>
}
