export default defineBackground(() => {
  const ports = new Map<number, browser.Runtime.Port>();

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== "devtools") {
      return;
    }

    const tab = port.sender?.tab?.id;
    console.log(`[effection-inspector] devtools panel connected (tab: ${tab})`);

    if (tab != null) {
      ports.set(tab, port);
      port.onDisconnect.addListener(() => {
        console.log(`[effection-inspector] devtools panel disconnected (tab: ${tab})`);
        ports.delete(tab);
      });
    }
  });
});
