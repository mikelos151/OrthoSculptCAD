export async function resolve(specifier, context, nextResolve) {
 if(specifier.startsWith('./') && !specifier.endsWith('.js') && context.parentURL?.includes('/compiled/')) return nextResolve(specifier+'.js',context);
 return nextResolve(specifier,context);
}
