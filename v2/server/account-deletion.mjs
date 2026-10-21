/** Remove all user-owned V2 records after verified account ownership proof. */
export function verifiedGoogleDeletion(session,record,identity){
  return Boolean(session && record && identity &&
    session.user?.id===record.deleteUserId && session.hash===record.deleteSessionHash &&
    session.user?.googleSub && session.user.googleSub===identity.googleSub &&
    session.user.email===identity.email);
}

export function deleteUserRecords(db,userId){
  db.users=db.users.filter(u=>u.id!==userId);
  db.sessions=db.sessions.filter(s=>s.userId!==userId);
  for(const key of ['favorites','history','routines','preferences','reports']){
    db[key]=db[key].filter(row=>row.owner!==userId);
  }
  db.emailTokens=db.emailTokens.filter(t=>t.userId!==userId);
  db.oauthStates=db.oauthStates.filter(t=>t.linkUserId!==userId && t.deleteUserId!==userId);
}
