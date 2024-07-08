<template>
  <aside class="main-sidebar sidebar-light-dark border-right">
    <!-- Brand Logo -->
    <span class="brand-link">
      <b-img src="@/assets/img/logo.png" class="brand-image"></b-img>
      <span class="brand-text font-weight-light font-weight-bold">
        NAUTILUS
      </span>
    </span>

    <!-- Sidebar -->
    <div class="sidebar">
      <!-- Sidebar Menu -->
      <nav class="mt-2">
        <b-nav pills class="nav-sidebar flex-column nav-child-indent">
          <li
            :class="[
              service.path === $route.path ? 'menu-open' : '',
              service.separator
                ? 'nav-header py-2 pl-2 font-weight-bold text-uppercase'
                : 'nav-item'
            ]"
            v-for="service in menu"
            :key="service.name"
          >
            <template v-if="service.separator">
              {{ service.name }}
            </template>
            <b-link
              v-else
              class="nav-link"
              :to="service.path"
              exact-active-class="active"
            >
              <b-icon :icon="service.icon" class="nav-icon"></b-icon>
              <p>
                {{ service.name }}
                <b-icon
                  v-if="service.items"
                  :icon="
                    service.path === $route.path
                      ? 'chevron-down'
                      : 'chevron-left'
                  "
                  class="right"
                  font-scale="1"
                ></b-icon>
              </p>
            </b-link>
          </li>
        </b-nav>
      </nav>
      <!-- /.sidebar-menu -->
    </div>
    <!-- /.sidebar -->
  </aside>
</template>

<script>
export default {
  data: () => ({
    menu: [
      {
        name: "Home",
        path: "/home",
        icon: "house"
      },
      {
        name: "Pools",
        path: "/pools",
        icon: "columns-gap"
      },
      {
        name: "Analysis",
        path: "/analysis",
        icon: "pie-chart"
      },
      {
        name: "Market",
        path: "/market",
        icon: "cart3"
      }
    ]
  })
};
</script>

<style></style>
