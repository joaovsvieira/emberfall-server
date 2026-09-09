// Aggregate presentation only: every unit keeps its persistent identity for receipts and transfers.
export function itemStacks(items:any[]){
 const groups=new Map<string,any>();
 for(const item of items){const stackable=item.definition?.stackable&&!item.equipped&&!item.listed,key=stackable?JSON.stringify([item.account_id,item.hero,item.catalog_id,item.quality??0]):item.id;
  const group=groups.get(key);if(group)group.quantity++;else groups.set(key,{...item,quantity:1});
 }
 return [...groups.values()];
}
