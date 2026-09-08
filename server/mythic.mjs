export const MYTHIC={version:1,limits:[0,480,600,720],fast:.6,medium:.8,forces:.95,hpPerLevel:1.12,damagePerLevel:1.08,maxLevel:100};
export function mythicRules(chapter,level){return {limitMs:MYTHIC.limits[chapter]*1000,hp:MYTHIC.hpPerLevel**level,damage:MYTHIC.damagePerLevel**level};}
export function mythicUpgrade(elapsedMs,limitMs,kills,total){if(elapsedMs>=limitMs)return null;return (elapsedMs<=limitMs*MYTHIC.fast?2:elapsedMs<=limitMs*MYTHIC.medium?1:0)+(total>0&&kills/total>=MYTHIC.forces?1:0);}
