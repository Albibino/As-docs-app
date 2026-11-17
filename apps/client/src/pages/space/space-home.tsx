import { useParams } from "react-router-dom";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { SpaceHomeContainer } from "@/features/space-home/components/space-home-container";

export default function SpaceHome() {
  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);

  return (
    <>
      <Helmet>
        <title>
          {space?.name || "Overview"} - {getAppName()}
        </title>
      </Helmet>
      {space && <SpaceHomeContainer space={space} />}
    </>
  );
}
