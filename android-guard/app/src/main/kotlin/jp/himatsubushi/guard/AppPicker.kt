package jp.himatsubushi.guard

import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog

/** インストール済みアプリから選ぶ（検索つき・複数選択）。 */
object AppPicker {
    fun show(ctx: Context, titleRes: Int, exclude: Set<String>, preselected: Set<String> = emptySet(), onPicked: (Set<String>) -> Unit) {
        val all = Apps.list(ctx).filter { it.pkg !in exclude }
        val chosen = LinkedHashSet(preselected)
        var shown = all
        val list = ListView(ctx).apply { divider = null }
        val adapter = object : BaseAdapter() {
            override fun getCount() = shown.size
            override fun getItem(i: Int) = shown[i]
            override fun getItemId(i: Int) = i.toLong()
            override fun getView(i: Int, v: View?, p: ViewGroup?): View {
                val e = shown[i]
                val row = ctx.hbox().apply { minimumHeight = ctx.dp(52); setPadding(ctx.dp(4), ctx.dp(4), ctx.dp(4), ctx.dp(4)) }
                val icon = ImageView(ctx).apply { setImageDrawable(Apps.icon(ctx, e.pkg)); layoutParams = LinearLayout.LayoutParams(ctx.dp(36), ctx.dp(36)).also { it.marginEnd = ctx.dp(12) } }
                val label = TextView(ctx).apply { text = e.label; textSize = 16f; setTextColor(ctx.attrColor(com.google.android.material.R.attr.colorOnSurface)); layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f) }
                val cb = CheckBox(ctx).apply { isChecked = e.pkg in chosen; isClickable = false; isFocusable = false; contentDescription = e.label }
                row.addView(icon); row.addView(label); row.addView(cb)
                return row
            }
        }
        list.adapter = adapter
        list.setOnItemClickListener { _, _, i, _ ->
            val p = shown[i].pkg
            if (!chosen.remove(p)) chosen.add(p)
            adapter.notifyDataSetChanged()
        }
        val search = EditText(ctx).apply {
            hint = ctx.getString(R.string.search_apps); setSingleLine(); minimumHeight = ctx.dp(48)
            addTextChangedListener(object : TextWatcher {
                override fun afterTextChanged(s: Editable?) {
                    val q = s?.toString()?.trim()?.lowercase().orEmpty()
                    shown = if (q.isEmpty()) all else all.filter { it.label.lowercase().contains(q) || it.pkg.contains(q) }
                    adapter.notifyDataSetChanged()
                }
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            })
        }
        val box = ctx.vbox(8)
        box.addView(search, lp())
        box.addView(list, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ctx.dp(380)))
        AlertDialog.Builder(ctx).setTitle(titleRes).setView(box)
            .setPositiveButton(android.R.string.ok) { _, _ -> onPicked(chosen) }
            .setNegativeButton(android.R.string.cancel, null).show()
    }
}
