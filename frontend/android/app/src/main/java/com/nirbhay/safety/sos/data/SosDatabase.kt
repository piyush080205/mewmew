package com.nirbhay.safety.sos.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [SosEventEntity::class, EmergencyContactEntity::class],
    version = 1,
    exportSchema = false
)
abstract class SosDatabase : RoomDatabase() {
    abstract fun sosEventDao(): SosEventDao
    abstract fun emergencyContactDao(): EmergencyContactDao

    companion object {
        @Volatile private var instance: SosDatabase? = null

        fun get(context: Context): SosDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    SosDatabase::class.java,
                    "jagriti_sos.db"
                ).build().also { instance = it }
            }
    }
}
