package com.nirbhay.safety.sos.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SosEventDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: SosEventEntity)

    @Update
    suspend fun update(event: SosEventEntity)

    @Query("SELECT * FROM sos_events WHERE id = :id")
    suspend fun getById(id: String): SosEventEntity?

    @Query(
        "SELECT * FROM sos_events WHERE cancelled = 0 AND status NOT IN ('COMPLETED', 'SERVER_SYNCED', 'FAILED') ORDER BY createdAt ASC"
    )
    suspend fun getPending(): List<SosEventEntity>

    @Query("SELECT * FROM sos_events ORDER BY createdAt DESC")
    fun getAll(): Flow<List<SosEventEntity>>

    @Query("UPDATE sos_events SET status = :status, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, updatedAt: Long)

    @Query("UPDATE sos_events SET cancelled = 1, updatedAt = :updatedAt WHERE id = :id")
    suspend fun markCancelled(id: String, updatedAt: Long)
}
