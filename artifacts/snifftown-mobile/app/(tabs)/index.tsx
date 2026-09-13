import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
 useAddDogToPack,
 useGetMyDog,
 useListDogs,
 getGetMyDogQueryKey,
 getListDogsQueryKey,
 buildDogCompatibility,
 labelFor,
 type Dog,
 type ListDogsParams,
} from "@workspace/api-client-react";
import { ActionButton, BrandMark, DogAvatar } from "@/components/Brand";
import { useColors } from "@/hooks/useColors";
import { CompatibilitySummary } from "@/components/CompatibilitySummary";
import { useSession } from "@/context/SessionContext";
import { enableNearbyDiscovery, getNearbyPreferences, RADIUS_OPTIONS, setNearbyRadius } from "@/lib/nearby";
function Card({ dog, viewerDog }: { dog: Dog; viewerDog?: Dog }) {
 const c=useColors(), router=useRouter(), qc=useQueryClient();
 const compatibility=buildDogCompatibility(viewerDog,dog);
 const interest=useAddDogToPack({ mutation:{onSuccess:()=>qc.invalidateQueries({queryKey:getListDogsQueryKey()})} });
 return <Pressable onPress={()=>router.push(`/dog/${dog.id}`)} style={[s.card,{backgroundColor:c.card,borderColor:c.border}]}><DogAvatar name={dog.name} uri={dog.photoUrl} size={68}/><View style={s.details}><View style={s.row}><Text style={[s.name,{color:c.foreground}]}>{dog.name}</Text>{dog.isInPack&&<Text style={[s.match,{color:c.accentForeground,backgroundColor:c.accent}]}>MATCHED</Text>}</View><Text style={{color:c.mutedForeground}}>with {dog.ownerName ?? "a local neighbor"}</Text>{dog.distanceMiles!==null&&<Text style={[s.distance,{color:c.accentForeground}]}>About {dog.distanceMiles} {dog.distanceMiles===1?"mile":"miles"} away</Text>}{dog.matchExplanation&& !compatibility?.restrictionCautions.length&&<Text style={[s.reason,{color:c.primary}]}>{dog.matchExplanation}</Text>}<Text numberOfLines={2} style={[s.desc,{color:c.foreground}]}>{dog.description ?? "Looking for a good Austin walk and familiar faces."}</Text><View style={s.tags}>{dog.temperament.slice(0,3).map(t=><Text key={t} style={[s.tag,{backgroundColor:c.secondary,color:c.secondaryForeground}]}>{t}</Text>)}</View>{(dog.lookingFor.length>0||dog.availability.length>0)&&<Text style={[s.summary,{color:c.mutedForeground}]}>{dog.lookingFor.slice(0,2).map(value=>labelFor("lookingFor",value)).join(" · ")}{dog.availability.length>0?` · ${dog.availability.slice(0,1).map(value=>labelFor("availability",value)).join("")}`:""}</Text>}{compatibility?.hasKnownSignals&&<CompatibilitySummary summary={compatibility} candidateName={dog.name} compact/>}{dog.isInPack?<ActionButton label="Matched" secondary onPress={()=>router.push(`/dog/${dog.id}`)}/>:<ActionButton label="Interested" disabled={interest.isPending} onPress={()=>{Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);interest.mutate({dogId:dog.id});}} icon="heart"/>}</View></Pressable>
}
export default function Discover() {
 const c=useColors(),insets=useSafeAreaInsets(),top=Platform.OS==="web"?67:insets.top+12,{user}=useSession();
 const own=useGetMyDog({query:{enabled:Boolean(user?.id),queryKey:getGetMyDogQueryKey()}});
 const [nearby,setNearby]=useState(false),[radius,setRadius]=useState(2),[locationReady,setLocationReady]=useState(true),[locationError,setLocationError]=useState<string|null>(null);
 const syncLocation=useCallback(async(requestPermission=false)=>{setLocationReady(false);setLocationError(null);try{await enableNearbyDiscovery(requestPermission);setNearby(true);setLocationReady(true);}catch(error){setLocationError(error instanceof Error?error.message:"Location is unavailable.");setLocationReady(true);}},[]);
 useFocusEffect(useCallback(()=>{let active=true;void getNearbyPreferences().then(p=>{if(!active)return;setNearby(p.enabled);setRadius(p.radius);if(p.enabled)void syncLocation(false);});return()=>{active=false};},[syncLocation]));
 const dogFilters:ListDogsParams|undefined=nearby?{nearby:true,radiusMiles:radius}:undefined;
 const q=useListDogs(dogFilters,{query:{enabled:locationReady,queryKey:getListDogsQueryKey(dogFilters)}});
 const chooseRadius=(next:number)=>{setRadius(next);void setNearbyRadius(next);};
 const currentRadiusIndex=RADIUS_OPTIONS.indexOf(radius as (typeof RADIUS_OPTIONS)[number]);
 const nextRadius=RADIUS_OPTIONS[currentRadiusIndex+1];
  return <View style={[s.page,{backgroundColor:c.background}]}><View style={[s.header,{paddingTop:top}]}><BrandMark compact/><Text style={[s.kicker,{color:c.accentForeground}]}>AUSTIN DOGS, CLOSE TO HOME</Text><Text style={[s.heading,{color:c.foreground}]}>Who’s out sniffing around?</Text>{nearby?<View style={s.radiusRow}>{RADIUS_OPTIONS.map(option=><Pressable key={option} onPress={()=>chooseRadius(option)} style={[s.radiusChip,{backgroundColor:radius===option?c.primary:c.secondary}]}><Text style={{color:radius===option?c.primaryForeground:c.secondaryForeground,fontWeight:"800"}}>{option} mi</Text></Pressable>)}</View>:<Pressable onPress={()=>void syncLocation(true)} style={[s.nearbyPrompt,{backgroundColor:c.accent}]}><Text style={[s.nearbyTitle,{color:c.accentForeground}]}>Find dogs close to you</Text><Text style={{color:c.foreground}}>Share your location only when using discovery. Exact coordinates stay private.</Text></Pressable>}{locationError&&<Text style={{color:c.destructive}}>{locationError}</Text>}</View>{!locationReady?<Text style={[s.center,{color:c.mutedForeground}]}>Updating your neighborhood…</Text>:q.isLoading?<Text style={[s.center,{color:c.mutedForeground}]}>Finding nearby dogs…</Text>:q.isError?<View style={s.center}><Text style={{color:c.foreground}}>We couldn’t reach the neighborhood.</Text><ActionButton label="Try again" onPress={()=>q.refetch()}/></View>:<FlatList data={q.data??[]} keyExtractor={d=>d.id} renderItem={({item})=><Card dog={item} viewerDog={user?.id && own.data?.ownerId===user.id ? own.data : undefined}/>} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={()=>nearby?void syncLocation(false):q.refetch()} tintColor={c.primary}/>} contentContainerStyle={q.data?.length?s.list:s.empty} ListEmptyComponent={<View style={s.center}><Text style={[s.emptyTitle,{color:c.foreground}]}>No dogs within {radius} miles yet</Text><Text style={{color:c.mutedForeground,textAlign:"center"}}>Only dogs whose people opted into nearby discovery appear here.</Text>{nearby&&nextRadius&&<ActionButton label={`Expand to ${nextRadius} miles`} onPress={()=>chooseRadius(nextRadius)}/>}</View>}/>}</View>
}
const s=StyleSheet.create({page:{flex:1},header:{paddingHorizontal:20,paddingBottom:12,gap:8},kicker:{fontSize:11,fontWeight:"800",letterSpacing:1.2},heading:{fontFamily:"Georgia",fontSize:30,fontWeight:"700"},nearbyPrompt:{padding:13,borderRadius:14,gap:3},nearbyTitle:{fontWeight:"800",fontSize:15},radiusRow:{flexDirection:"row",gap:8},radiusChip:{paddingHorizontal:14,paddingVertical:9,borderRadius:18},list:{padding:16,gap:12,paddingBottom:110},empty:{flexGrow:1,justifyContent:"center",padding:35},card:{borderWidth:1,borderRadius:16,padding:14,flexDirection:"row",gap:13},details:{flex:1,gap:7},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},name:{fontSize:20,fontWeight:"800"},match:{fontSize:10,fontWeight:"800",paddingHorizontal:7,paddingVertical:4,borderRadius:10},distance:{fontSize:13,fontWeight:"800"},reason:{fontSize:12,fontWeight:"800"},desc:{fontSize:14,lineHeight:19},summary:{fontSize:12,lineHeight:17},tags:{flexDirection:"row",flexWrap:"wrap",gap:5},tag:{fontSize:12,paddingHorizontal:8,paddingVertical:4,borderRadius:10,fontWeight:"600"},center:{alignItems:"center",justifyContent:"center",gap:13,flex:1,padding:25},emptyTitle:{fontFamily:"Georgia",fontSize:22,fontWeight:"700",textAlign:"center"}});