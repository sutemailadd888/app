import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 管理者権限を持つ特別なクライアントを作成 (サーバー側でのみ使用)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ★ここが超重要
);

export async function POST(req: Request) {
  try {
    const { workspace_id, email } = await req.json();

    if (!workspace_id || !email) {
      return NextResponse.json({ error: 'Data missing' }, { status: 400 });
    }

    // 1. メールアドレスからユーザーIDを検索 (Admin権限が必要)
    // ※注意: まだアプリに登録していないユーザーは招待できません（今回は簡易版のため）
    const { data: userList, error: searchError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (searchError) throw searchError;

    // メールアドレスが一致するユーザーを探す
    const targetUser = userList.users.find((u) => u.email === email);

    if (!targetUser) {
      return NextResponse.json({ error: 'ユーザーが見つかりません。相手が先にアプリにログインしている必要があります。' }, { status: 404 });
    }

    // 2. メンバーに追加する
    const { error: insertError } = await supabaseAdmin
      .from('workspace_members')
      .insert({
        workspace_id: workspace_id,
        user_id: targetUser.id,
        role: 'member' // デフォルトは一般メンバー
      });

    if (insertError) {
      // すでに登録済みの場合などのエラーハンドリング
      if (insertError.code === '23505') { // Unique violation
         return NextResponse.json({ error: 'そのユーザーは既にメンバーです' }, { status: 400 });
      }
      throw insertError;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Invite Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// メンバー一覧を取得するAPI
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspace_id = searchParams.get('workspace_id');

  if (!workspace_id) return NextResponse.json({ error: 'Workspace ID required' }, { status: 400 });

  // メンバーIDを取得
  const { data: members, error } = await supabaseAdmin
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspace_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 各メンバーの詳細情報を取得 (emailなど)
  // ※本来はJOINしたいですが、auth.usersは直接JOINできないため、アプリ側で工夫するか、
  // ここでAdmin権限を使って情報を付加して返します。
  
  const enrichedMembers = await Promise.all(members.map(async (m) => {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
    return {
      user_id: m.user_id,
      role: m.role,
      email: user?.email || '不明なユーザー',
      last_sign_in: user?.last_sign_in_at
    };
  }));

  return NextResponse.json({ members: enrichedMembers });
}