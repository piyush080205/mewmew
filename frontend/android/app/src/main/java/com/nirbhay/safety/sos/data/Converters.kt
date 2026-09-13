package com.nirbhay.safety.sos.data

import androidx.room.TypeConverter
import org.json.JSONArray

/** JSON-encodes the small string lists Room can't store natively. */
class Converters {

    @TypeConverter
    fun fromStringList(list: List<String>?): String =
        JSONArray(list ?: emptyList<String>()).toString()

    @TypeConverter
    fun toStringList(value: String?): List<String> {
        if (value.isNullOrBlank()) return emptyList()
        val arr = JSONArray(value)
        return (0 until arr.length()).map { arr.getString(it) }
    }
}
