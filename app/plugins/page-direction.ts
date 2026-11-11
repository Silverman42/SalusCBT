// Page transitions follow the URL hierarchy: a deeper page swipes in from the
// right, a shallower one from the left, and pages at the same level fade.
// app.vue passes the name to <NuxtPage>; styles live in app/assets/css/main.css.
// (Setting it on route meta in a middleware lags one navigation behind.)

/** "/" is 0, "/tutor" is 1, "/tutor/versions/abc" is 3. */
const depth = (path: string) => path.split("/").filter(Boolean).length;

export default defineNuxtPlugin(() => {
  const name = useState("page-transition-name", () => "page-fade");
  useRouter().beforeEach((to, from) => {
    if (to.path === from.path) return;
    const delta = depth(to.path) - depth(from.path);
    name.value = delta > 0 ? "page-forward" : delta < 0 ? "page-back" : "page-fade";
  });
});
