import classes from "./page-header.module.css";
import PageHeaderMenu from "@/features/page/components/header/page-header-menu.tsx";
import { Group } from "@mantine/core";
import Breadcrumb from "@/features/page/components/breadcrumbs/breadcrumb.tsx";

interface Props {
  readOnly?: boolean;
}
export default function PageHeader({ readOnly }: Props) {
  return (
    <div className={classes.header} data-page-header="true">
      <Group justify="space-between" h="100%" px="md" wrap="nowrap" className={classes.group}>
        <Breadcrumb />

        <Group
          justify="flex-end"
          h="100%"
          px="md"
          wrap="nowrap"
          gap="var(--mantine-spacing-xs)"
          // `space-between` parks a lone child at the start, and a page with no
          // ancestors renders no breadcrumb — so the actions claim the free
          // space themselves instead of relying on a sibling being there.
          ml="auto"
        >
          <PageHeaderMenu readOnly={readOnly} />
        </Group>
      </Group>
    </div>
  );
}
