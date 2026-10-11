import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteAccount as requestDeleteAccount, getCurrentUser, refreshSession, setAuthTokenGetter, signOut as requestSignOut, type CurrentUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { isParkPackDetailViewerQueryKey } from "@/lib/park-pack";

const ACCESS = "snifftown.access", REFRESH = "snifftown.refresh";
// AsyncStorage is only used by Expo's browser preview; iOS production uses Keychain-backed SecureStore.
const sessionStorage = Platform.OS === "web" ? { getItemAsync: AsyncStorage.getItem, setItemAsync: AsyncStorage.setItem, deleteItemAsync: AsyncStorage.removeItem } : SecureStore;
type Value = { user: CurrentUser | null; ready: boolean; saveSession: (access: string, refresh: string, user: CurrentUser) => Promise<void>; refresh: () => Promise<boolean>; signOut: () => Promise<void>; deleteAccount: () => Promise<void> };
const SessionContext = createContext<Value | null>(null);
setAuthTokenGetter(() => sessionStorage.getItemAsync(ACCESS));

export function SessionProvider({ children }: { children: ReactNode }) {
 const [user,setUser]=useState<CurrentUser|null>(null),[ready,setReady]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null), refreshing=useRef(false);
 const queryClient=useQueryClient();
 const previousUserId=useRef<string|null|undefined>(undefined);
 const clear=async()=>{if(timer.current)clearTimeout(timer.current);await Promise.all([sessionStorage.deleteItemAsync(ACCESS),sessionStorage.deleteItemAsync(REFRESH)]);setUser(null);};
 const schedule=(access:string)=>{if(timer.current)clearTimeout(timer.current);try{const part=access.split(".")[1];const payload=part?JSON.parse(globalThis.atob(part)):null;const expiry=typeof payload?.exp==="number"?payload.exp*1000:0;timer.current=setTimeout(()=>void refresh(),Math.max(30_000,expiry-Date.now()-60_000));}catch{timer.current=setTimeout(()=>void refresh(),30*60_000);}};
 const saveSession=async(access:string,refreshToken:string,next:CurrentUser)=>{await Promise.all([sessionStorage.setItemAsync(ACCESS,access),sessionStorage.setItemAsync(REFRESH,refreshToken)]);setUser(next);schedule(access);};
 const refresh=async()=>{if(refreshing.current)return false;refreshing.current=true;try{const refreshToken=await sessionStorage.getItemAsync(REFRESH);if(!refreshToken)return false;const result=await refreshSession({refreshToken},{headers:{"X-SniffTown-Client":"mobile"}});if(!result.accessToken||!result.refreshToken||!result.user.id)throw new Error("Invalid session");await saveSession(result.accessToken,result.refreshToken,result.user);return true;}catch{await clear();return false;}finally{refreshing.current=false;}};
  useEffect(()=>{void(async()=>{if(await sessionStorage.getItemAsync(REFRESH)){if(await refresh()){try{const current=await getCurrentUser();if(current.id)setUser(current);}catch{await clear();}}}setReady(true);})();return()=>{if(timer.current)clearTimeout(timer.current);};},[]);
  useEffect(()=>{
   if(!ready)return;
   const nextUserId=user?.id??null,previous=previousUserId.current;
   previousUserId.current=nextUserId;
   if(previous===undefined||previous===nextUserId)return;
   void(async()=>{
    await queryClient.cancelQueries({predicate:(query)=>isParkPackDetailViewerQueryKey(query.queryKey)});
    queryClient.removeQueries({predicate:(query)=>isParkPackDetailViewerQueryKey(query.queryKey)});
   })();
  },[ready,user?.id,queryClient]);
 const signOut=async()=>{await refresh();try{await requestSignOut();}catch{/* always remove local credentials */}await clear();};
 // Deletion needs a live session; on failure the member stays signed in so nothing looks deleted when it was not.
 const deleteAccount=async()=>{if(!await refresh())throw new Error("Please sign in again, then delete your account.");await requestDeleteAccount();await clear();queryClient.clear();};
 return <SessionContext.Provider value={{user,ready,saveSession,refresh,signOut,deleteAccount}}>{children}</SessionContext.Provider>;
}
export function useSession(){const value=useContext(SessionContext);if(!value)throw new Error("useSession must be used within SessionProvider");return value;}